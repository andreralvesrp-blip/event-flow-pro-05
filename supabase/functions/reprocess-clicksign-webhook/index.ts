// Reprocess a previously-stored Clicksign webhook event.
// Requires an authenticated admin user of the matching tenant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processClicksignPayload, type Json } from "../_shared/clicksign-parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify user via anon client with their JWT
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await admin.from("users")
    .select("tenant_id, role, active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active || profile.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { webhook_event_id?: string } = {};
  try { body = await req.json(); } catch { /* noop */ }
  const eventId = body.webhook_event_id;
  if (!eventId) {
    return new Response(JSON.stringify({ error: "webhook_event_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: ev, error: evErr } = await admin.from("clicksign_webhook_events")
    .select("id, tenant_id, payload").eq("id", eventId).maybeSingle();
  if (evErr || !ev) {
    return new Response(JSON.stringify({ error: "event not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (ev.tenant_id !== profile.tenant_id) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { contract_id, client_id } = await processClicksignPayload(
      admin, ev.tenant_id, ev.payload as Json,
    );
    await admin.from("clicksign_webhook_events").update({
      processed: true, processing_error: null, processed_at: new Date().toISOString(),
    }).eq("id", eventId);
    return new Response(JSON.stringify({ ok: true, contract_id, client_id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("clicksign_webhook_events").update({
      processing_error: message, processed: false, processed_at: new Date().toISOString(),
    }).eq("id", eventId);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
