// Public endpoint for the "orcamento_automatico" form flow (v2).
// - GET  ?slug=...  -> form config for ANY form (incl. flow_version), so the
//                      public form page can decide which flow/endpoint to use.
// - POST            -> ONLY forms with flow_version = 'orcamento_automatico'.
//                      Creates client (by normalized phone) + opportunity
//                      (without celebrant), runs the same internal date-check
//                      as lead-intake, then fires the quote dispatch without
//                      ever blocking or failing the lead creation.
// The original lead-intake edge function is untouched and keeps serving the
// "atual" flow.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "crypto";
import { dispatchQuote } from "@/lib/quote-dispatch.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const Body = z.object({
  form_slug: z.string().min(1).max(120),
  desired_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parent_name: z.string().trim().min(1).max(200),
  parent_phone: z.string().min(8).max(30),
  parent_email: z.string().max(255).nullish(),
  marketing_consent: z.boolean().nullish(),
  website: z.string().max(255).nullish(), // honeypot
  utm_source: z.string().max(255).nullish(),
  utm_medium: z.string().max(255).nullish(),
  utm_campaign: z.string().max(255).nullish(),
  utm_content: z.string().max(255).nullish(),
  utm_term: z.string().max(255).nullish(),
  gclid: z.string().max(512).nullish(),
  gbraid: z.string().max(512).nullish(),
  wbraid: z.string().max(512).nullish(),
  fbclid: z.string().max(512).nullish(),
  fbp: z.string().max(512).nullish(),
  fbc: z.string().max(512).nullish(),
  landing_page: z.string().max(2048).nullish(),
  referrer: z.string().max(2048).nullish(),
  marketing_event_id: z.string().max(128).nullish(),
});

type Slot = "almoco" | "jantar";
const ALMOCO_STARTS = ["12:00", "12:30"];
const JANTAR_STARTS = ["18:00", "18:30", "19:00"];

function endOf(start: string): number {
  const [h, m] = start.split(":").map(Number);
  return h * 60 + m + 4 * 60;
}
function startMin(start: string): number {
  const [h, m] = start.split(":").map(Number);
  return h * 60 + m;
}
function compatibleJantarStarts(almocoStart: string): string[] {
  const minFree = endOf(almocoStart) + 120;
  return JANTAR_STARTS.filter((s) => startMin(s) >= minFree);
}
function compatibleAlmocoStarts(jantarStart: string): string[] {
  const maxAlmocoEnd = startMin(jantarStart) - 120;
  return ALMOCO_STARTS.filter((s) => startMin(s) + 4 * 60 <= maxAlmocoEnd);
}
function classifyStart(start: string): Slot | null {
  const hhmm = start.slice(0, 5);
  if (ALMOCO_STARTS.includes(hhmm)) return "almoco";
  if (JANTAR_STARTS.includes(hhmm)) return "jantar";
  return null;
}

// Digits only; prepend DDI 55 when missing.
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (/^55\d{10,11}$/.test(d)) return d;
  if (d.length >= 10 && d.length <= 11) return "55" + d;
  return d;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Rate limits (DB-backed, table lead_intake_rate_log)
const IP_LIMIT_PER_HOUR = 5;
const PHONE_LIMIT_PER_DAY = 3;

export const Route = createFileRoute("/api/public/lead-intake-v2")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const u = new URL(request.url);
        const slug = u.searchParams.get("slug");
        if (!slug) return json({ error: "missing_slug" }, 400);
        const { data, error } = await supabaseAdmin
          .from("forms")
          .select(
            "name, welcome_message, active, attendant_name, attendant_avatar_url, attendant_online, privacy_policy_url, flow_version, whatsapp_enabled",
          )
          .eq("slug", slug)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "form_not_found" }, 404);
        return json(data);
      },

      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          let raw: unknown = null;
          try {
            raw = await request.json();
          } catch {
            return json({ error: "invalid_json" }, 400);
          }
          const parsed = Body.safeParse(raw);
          if (!parsed.success) return json({ error: "missing_fields" }, 400);
          const b = parsed.data;

          // Honeypot: bots get a fake success; nothing is saved or sent.
          if (b.website && b.website.trim() !== "") {
            return json({ success: true, dropped: true });
          }

          const emailClean =
            b.parent_email && EMAIL_RE.test(b.parent_email.trim())
              ? b.parent_email.trim().toLowerCase()
              : null;

          // a) Form — must be active AND in the orcamento_automatico flow
          const { data: form, error: fErr } = await supabaseAdmin
            .from("forms")
            .select("id, tenant_id, unit_id, source, utm_campaign, active, flow_version")
            .eq("slug", b.form_slug)
            .maybeSingle();
          if (fErr) return json({ error: fErr.message }, 500);
          if (!form || !form.active) return json({ error: "form_not_found" }, 404);
          if (form.flow_version !== "orcamento_automatico") {
            return json({ error: "wrong_flow_version" }, 400);
          }

          const phoneNorm = normalizePhone(b.parent_phone);

          // b) Rate limit (DB). When hit: lead is still saved, messages are NOT sent.
          const ipRaw =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown";
          const ipHash = createHash("sha256")
            .update(`${ipRaw}|${process.env.SUPABASE_SERVICE_ROLE_KEY || "salt"}`)
            .digest("hex");
          const now = Date.now();
          const oneHourAgo = new Date(now - 3600_000).toISOString();
          const oneDayAgo = new Date(now - 86400_000).toISOString();

          let rateLimited = false;
          try {
            const ipQ = supabaseAdmin
              .from("lead_intake_rate_log")
              .select("id", { count: "exact", head: true })
              .eq("ip_hash", ipHash)
              .gte("created_at", oneHourAgo);
            const phoneQ = phoneNorm
              ? supabaseAdmin
                  .from("lead_intake_rate_log")
                  .select("id", { count: "exact", head: true })
                  .eq("phone_normalized", phoneNorm)
                  .gte("created_at", oneDayAgo)
              : null;
            const [{ count: ipCount }, phoneRes] = await Promise.all([
              ipQ,
              phoneQ ?? Promise.resolve({ count: 0 }),
            ]);
            const phoneCount = phoneRes?.count ?? 0;
            rateLimited =
              (ipCount ?? 0) >= IP_LIMIT_PER_HOUR || phoneCount >= PHONE_LIMIT_PER_DAY;
            await supabaseAdmin.from("lead_intake_rate_log").insert({
              tenant_id: form.tenant_id,
              form_slug: b.form_slug,
              ip_hash: ipHash,
              phone_normalized: phoneNorm,
            } as never);
          } catch (e) {
            console.error("[lead-intake-v2] rate_log error", e);
          }

          // b2) Duplicidade: mesmo telefone + mesmo formulário + mesma data em 24h
          //     -> reaproveita a oportunidade, atualiza dados, NÃO dispara envio.
          if (phoneNorm) {
            const { data: dup } = await supabaseAdmin
              .from("opportunities")
              .select("id, client_id, email, marketing_consent, lead_event_id, clients!inner(full_name, phone_normalized)")
              .eq("tenant_id", form.tenant_id)
              .eq("form_slug", b.form_slug)
              .eq("desired_date", b.desired_date)
              .eq("clients.phone_normalized", phoneNorm)
              .gte("created_at", oneDayAgo)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (dup?.id) {
              const d = dup as any;
              const consent = b.marketing_consent === true;
              const oppUpd: Record<string, unknown> = {};
              if (emailClean && emailClean !== d.email) oppUpd.email = emailClean;
              if (consent !== !!d.marketing_consent) {
                oppUpd.marketing_consent = consent;
                oppUpd.marketing_consent_at = consent ? new Date().toISOString() : null;
              }
              if (Object.keys(oppUpd).length)
                await supabaseAdmin.from("opportunities").update(oppUpd as never).eq("id", d.id);
              if (b.parent_name && b.parent_name !== d.clients?.full_name)
                await supabaseAdmin
                  .from("clients")
                  .update({ full_name: b.parent_name } as never)
                  .eq("id", d.client_id);
              return json({
                success: true,
                opportunity_id: d.id,
                // Sem lead_event_id de propósito: a página do formulário só
                // dispara kpw-lead-created quando ele vem na resposta.
                duplicate: true,
                dispatch: "duplicado",
              });
            }
          }

          // c) Client by normalized phone
          let clientId: string | null = null;
          // Pode haver vários cadastros com o mesmo telefone (maybeSingle falhava
          // nesse caso e um novo era criado). Prioridade: com contrato; senão o mais antigo.
          let existing: { id: string; email: string | null } | null = null;
          if (phoneNorm) {
            const { data: matches } = await supabaseAdmin
              .from("clients")
              .select("id, email, created_at, contracts(id)")
              .eq("tenant_id", form.tenant_id)
              .eq("phone_normalized", phoneNorm)
              .order("created_at", { ascending: true })
              .limit(1, { foreignTable: "contracts" });
            const list = (matches ?? []) as any[];
            const pick = list.find((c) => (c.contracts ?? []).length > 0) ?? list[0];
            if (pick) existing = { id: pick.id, email: pick.email };

            // Fallback: cadastros antigos sem phone_normalized — calcula a partir de phone.
            if (!existing) {
              const { data: legacy } = await supabaseAdmin
                .from("clients")
                .select("id, email, phone, created_at, contracts(id)")
                .eq("tenant_id", form.tenant_id)
                .is("phone_normalized", null)
                .not("phone", "is", null)
                .order("created_at", { ascending: true })
                .limit(1, { foreignTable: "contracts" })
                .limit(5000);
              const hits = ((legacy ?? []) as any[]).filter(
                (c) => normalizePhone(c.phone) === phoneNorm,
              );
              const lp = hits.find((c) => (c.contracts ?? []).length > 0) ?? hits[0];
              if (lp) {
                existing = { id: lp.id, email: lp.email };
                await supabaseAdmin
                  .from("clients")
                  .update({ phone_normalized: phoneNorm } as never)
                  .eq("id", lp.id);
              }
            }
          }

          if (existing?.id) {
            clientId = existing.id;
            // Contato existe sem e-mail -> grava o informado.
            if (emailClean && !existing.email) {
              await supabaseAdmin.from("clients").update({ email: emailClean }).eq("id", clientId);
            }
            // Contato com OUTRO e-mail -> mantém o cadastro; o e-mail informado
            // vai para opportunities.email e é sempre o usado no envio.
          } else {
            const { data: created, error: cErr } = await supabaseAdmin
              .from("clients")
              .insert({
                tenant_id: form.tenant_id,
                unit_id: form.unit_id,
                full_name: b.parent_name,
                phone: b.parent_phone,
                phone_normalized: phoneNorm,
                email: emailClean,
                status: "lead",
                source: form.source,
              } as never)
              .select("id")
              .single();
            if (cErr) return json({ error: cErr.message }, 500);
            clientId = created.id;
          }

          // d) Opportunity
          const finalCampaign = b.utm_campaign || form.utm_campaign || null;
          const leadEventId = crypto.randomUUID();

          const { data: classifiedSource, error: clErr } = await supabaseAdmin.rpc(
            "classify_lead_source",
            {
              _gclid: b.gclid || null,
              _fbclid: b.fbclid || null,
              _utm_source: b.utm_source || null,
              _utm_medium: b.utm_medium || null,
              _referrer: b.referrer || null,
              _landing_page: b.landing_page || null,
              _gbraid: b.gbraid || null,
              _wbraid: b.wbraid || null,
            } as never,
          );
          const leadSource = !clErr && classifiedSource ? classifiedSource : "outro";

          const consentGiven = b.marketing_consent === true;
          const { data: opp, error: oErr } = await supabaseAdmin
            .from("opportunities")
            .insert({
              tenant_id: form.tenant_id,
              unit_id: form.unit_id,
              client_id: clientId,
              celebrant_name: null,
              celebrant_age: null,
              desired_date: b.desired_date,
              desired_slot: null,
              stage: "em_conversa",
              source: leadSource,
              form_id: form.id,
              form_slug: b.form_slug,
              email: emailClean,
              marketing_consent: consentGiven,
              marketing_consent_at: consentGiven ? new Date().toISOString() : null,
              utm_source: b.utm_source || null,
              utm_medium: b.utm_medium || null,
              utm_campaign: finalCampaign,
              utm_content: b.utm_content || null,
              utm_term: b.utm_term || null,
              gclid: b.gclid || null,
              gbraid: b.gbraid || null,
              wbraid: b.wbraid || null,
              fbclid: b.fbclid || null,
              fbp: b.fbp || null,
              fbc: b.fbc || null,
              landing_page: b.landing_page || null,
              referrer: b.referrer || null,
              marketing_event_id: b.marketing_event_id || null,
              lead_event_id: leadEventId,
              first_response_at: new Date().toISOString(),
              stage_changed_at: new Date().toISOString(),
            } as never)
            .select("id")
            .single();
          if (oErr) return json({ error: oErr.message }, 500);

          // e) Checagem interna de disponibilidade (mesma regra da lead-intake;
          //    sem nome do aniversariante, usa o nome do responsável).
          const { data: confirmed } = await supabaseAdmin
            .from("contracts")
            .select("event_start_time")
            .eq("tenant_id", form.tenant_id)
            .eq("event_date", b.desired_date)
            .eq("status", "assinado");

          const { data: preres } = await supabaseAdmin
            .from("opportunities")
            .select("desired_slot")
            .eq("tenant_id", form.tenant_id)
            .eq("desired_date", b.desired_date)
            .eq("stage", "pre_reserva")
            .gt("pre_reserva_expires_at", new Date().toISOString());

          let almocoBlocked = false;
          let jantarBlocked = false;
          let almocoStart: string | null = null;
          let jantarStart: string | null = null;
          for (const r of confirmed || []) {
            if (!r.event_start_time) continue;
            const slot = classifyStart(r.event_start_time);
            if (slot === "almoco") {
              almocoBlocked = true;
              almocoStart = r.event_start_time.slice(0, 5);
            }
            if (slot === "jantar") {
              jantarBlocked = true;
              jantarStart = r.event_start_time.slice(0, 5);
            }
          }
          if (almocoStart && compatibleJantarStarts(almocoStart).length === 0) jantarBlocked = true;
          if (jantarStart && compatibleAlmocoStarts(jantarStart).length === 0) almocoBlocked = true;

          const preAlmoco = (preres || []).some((p) => p.desired_slot === "almoco");
          const preJantar = (preres || []).some((p) => p.desired_slot === "jantar");

          let dateStatus: "available" | "pre_reserved" | "fully_booked";
          if (almocoBlocked && jantarBlocked) {
            dateStatus = "fully_booked";
          } else if ((!almocoBlocked && preAlmoco) || (!jantarBlocked && preJantar)) {
            const anyFreeWithoutPre =
              (!almocoBlocked && !preAlmoco) || (!jantarBlocked && !preJantar);
            dateStatus = anyFreeWithoutPre ? "available" : "pre_reserved";
          } else {
            dateStatus = "available";
          }
          // dateStatus é interno — nunca exibido ao cliente neste fluxo.

          // f) Disparo (e-mail + passo WhatsApp) — o lead JÁ está salvo; uma
          //    falha aqui nunca impede nem invalida a criação do lead.
          let dispatch = "skipped";
          if (rateLimited) {
            dispatch = "rate_limited";
            try {
              const recipient = emailClean;
              await supabaseAdmin.from("quote_sends").insert({
                tenant_id: form.tenant_id,
                opportunity_id: opp.id,
                channel: "email",
                status: "bloqueado_limite",
                recipient,
                provider_response: "Limite de envios atingido (IP/telefone)",
              } as never);
            } catch (e) {
              console.error("[lead-intake-v2] rate_limit log error", e);
            }
          } else {
            try {
              const result = await dispatchQuote(opp.id);
              dispatch = result.email_status;
            } catch (e) {
              dispatch = "error";
              console.error("[lead-intake-v2] dispatch error", e);
            }
          }

          return json({
            success: true,
            opportunity_id: opp.id,
            lead_event_id: leadEventId,
            date_status: dateStatus,
            dispatch,
          });
        } catch (err) {
          console.error("[lead-intake-v2] server_error", err);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});
