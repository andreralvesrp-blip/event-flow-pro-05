// Public first-party endpoint for marketing events sent by the widget.
// No auth required. Uses service_role on the server (never exposed to client).
// Lightweight in-memory rate limit per session_id/ip (per-instance, best-effort).

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { createHash } from "crypto";

const ALLOWED_EVENTS = new Set(["site_session", "form_open_cta", "form_open_float"]);

const Body = z.object({
  event_name: z.string().min(1).max(64),
  form_slug: z.string().min(1).max(120),
  open_method: z.string().max(40).nullish(),
  page_location: z.string().max(2048).nullish(),
  page_path: z.string().max(1024).nullish(),
  referrer: z.string().max(2048).nullish(),
  landing_page: z.string().max(2048).nullish(),
  utm_source: z.string().max(255).nullish(),
  utm_medium: z.string().max(255).nullish(),
  utm_campaign: z.string().max(255).nullish(),
  utm_content: z.string().max(255).nullish(),
  utm_term: z.string().max(255).nullish(),
  gclid: z.string().max(512).nullish(),
  fbclid: z.string().max(512).nullish(),
  session_id: z.string().max(128).nullish(),
});

// best-effort rate limit (per worker instance)
const RL = new Map<string, { count: number; reset: number }>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60; // 60 events / minute / key

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = RL.get(key);
  if (!entry || entry.reset < now) {
    RL.set(key, { count: 1, reset: now + RL_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RL_MAX) return true;
  return false;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const Route = createFileRoute("/api/public/marketing-event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        try {
          // Accept any Content-Type (sendBeacon may send text/plain or application/json)
          const text = await request.text().catch(() => "");
          let raw: unknown = null;
          try { raw = text ? JSON.parse(text) : null; } catch { raw = null; }
          const parsed = Body.safeParse(raw);
          if (!parsed.success) {
            return new Response(JSON.stringify({ error: "invalid_body" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }
          const b = parsed.data;
          if (!ALLOWED_EVENTS.has(b.event_name)) {
            return new Response(JSON.stringify({ error: "invalid_event" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }

          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "0.0.0.0";
          const rlKey = `${b.session_id || ip}:${b.event_name}`;
          if (rateLimited(rlKey)) {
            return new Response(JSON.stringify({ error: "rate_limited" }), {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }

          // Resolve form -> tenant/unit
          const { data: form, error: formErr } = await supabaseAdmin
            .from("forms")
            .select("id, tenant_id, unit_id, active")
            .eq("slug", b.form_slug)
            .maybeSingle();
          if (formErr || !form || !form.active) {
            return new Response(JSON.stringify({ error: "unknown_form" }), {
              status: 404,
              headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }

          const ipHash = createHash("sha256")
            .update(`${ip}|${process.env.SUPABASE_SERVICE_ROLE_KEY || "salt"}`)
            .digest("hex")
            .slice(0, 32);

          const ua = request.headers.get("user-agent")?.slice(0, 512) ?? null;

          const { error: insErr } = await supabaseAdmin.from("marketing_events").insert({
            tenant_id: form.tenant_id,
            unit_id: form.unit_id,
            event_name: b.event_name,
            form_slug: b.form_slug,
            open_method: b.open_method ?? null,
            page_location: b.page_location ?? null,
            page_path: b.page_path ?? null,
            referrer: b.referrer ?? null,
            landing_page: b.landing_page ?? null,
            utm_source: b.utm_source ?? null,
            utm_medium: b.utm_medium ?? null,
            utm_campaign: b.utm_campaign ?? null,
            utm_content: b.utm_content ?? null,
            utm_term: b.utm_term ?? null,
            gclid: b.gclid ?? null,
            fbclid: b.fbclid ?? null,
            session_id: b.session_id ?? null,
            user_agent: ua,
            ip_hash: ipHash,
          });

          if (insErr) {
            console.error("marketing-event insert failed", insErr);
            return new Response(JSON.stringify({ error: "insert_failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders() },
            });
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        } catch (err) {
          console.error("marketing-event error", err);
          return new Response(JSON.stringify({ error: "server_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }
      },
    },
  },
});
