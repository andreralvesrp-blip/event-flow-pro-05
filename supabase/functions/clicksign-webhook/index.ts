// Clicksign webhook receiver — Phase 2.2
// HMAC SHA256 validation + delegates parsing to _shared/clicksign-parser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractTopLevel,
  processClicksignPayload,
  verifyHmacSha256,
  type Json,
} from "../_shared/clicksign-parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, content-hmac",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TENANT_SLUG = "kids-point";

// Header names where Clicksign / generic providers send the HMAC signature.
const HMAC_HEADERS = [
  "content-hmac",            // Clicksign canonical
  "x-clicksign-signature",
  "x-hub-signature-256",
  "x-webhook-signature",
  "x-signature",
];

function getSignatureHeader(headers: Headers): { name: string; value: string } | null {
  for (const h of HMAC_HEADERS) {
    const v = headers.get(h);
    if (v) return { name: h, value: v };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Read raw body BEFORE JSON.parse so HMAC verification matches Clicksign.
  let rawText = "";
  try { rawText = await req.text(); }
  catch {
    return new Response(JSON.stringify({ error: "could not read body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Json = {};
  try { payload = rawText ? JSON.parse(rawText) : {}; }
  catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Log incoming header names (not values) for diagnostics — helps find the
  // exact header Clicksign uses. Never log secret or full signature value.
  const headerNames = [...req.headers.keys()];
  console.log("[clicksign-webhook] incoming headers:", JSON.stringify(headerNames));

  const { data: tenant } = await admin.from("tenants").select("id").eq("slug", TENANT_SLUG).maybeSingle();
  if (!tenant) {
    return new Response(JSON.stringify({ error: "tenant not found" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = tenant.id as string;

  const { data: secretRow } = await admin.from("system_settings").select("value")
    .eq("tenant_id", tenantId).eq("key", "clicksign_webhook_secret").maybeSingle();
  const secret = (secretRow?.value ?? "").trim();

  // HMAC validation
  const sigHeader = getSignatureHeader(req.headers);
  if (secret) {
    if (!sigHeader) {
      console.warn("[clicksign-webhook] missing HMAC header. Saw:", JSON.stringify(headerNames));
      return new Response(JSON.stringify({ error: "missing signature header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ok = await verifyHmacSha256(rawText, secret, sigHeader.value);
    console.log(`[clicksign-webhook] hmac via ${sigHeader.name}: ${ok ? "ok" : "INVALID"}`);
    if (!ok) {
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("[clicksign-webhook] secret not configured — accepting unauthenticated (dev mode)");
  }

  const { eventName, documentKey, rawStatus } = extractTopLevel(payload);

  const { data: eventRow, error: insErr } = await admin.from("clicksign_webhook_events").insert({
    tenant_id: tenantId, event_name: eventName, document_key: documentKey,
    status: rawStatus, payload, processed: false,
  }).select("id").single();
  if (insErr || !eventRow) {
    return new Response(JSON.stringify({ error: "log failed", detail: insErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const eventId = eventRow.id as string;

  try {
    const { contract_id, client_id, warnings } = await processClicksignPayload(admin, tenantId, payload);
    await admin.from("clicksign_webhook_events").update({
      processed: true,
      processing_error: warnings.length ? warnings.join(" | ") : null,
      processed_at: new Date().toISOString(),
    }).eq("id", eventId);
    return new Response(JSON.stringify({ ok: true, contract_id, client_id, warnings }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[clicksign-webhook] processing error:", message);
    await admin.from("clicksign_webhook_events").update({
      processing_error: message, processed: false, processed_at: new Date().toISOString(),
    }).eq("id", eventId);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
