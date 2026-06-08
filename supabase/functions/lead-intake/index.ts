// Edge Function: lead-intake
// Public endpoint (verify_jwt = false) for the conversational lead form.
// - GET  ?slug=...  -> returns { name, welcome_message, active } for the form widget
// - POST            -> creates client (or finds), opportunity, runs date-check, returns whatsapp stub

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

type Slot = "almoco" | "jantar";

// Slot start times allowed
const ALMOCO_STARTS = ["12:00", "12:30"];
const JANTAR_STARTS = ["18:00", "18:30", "19:00"];

// Compatibility: given a confirmed start of one slot, which starts of the OTHER slot are still possible?
// We use the rule: party_duration = 4h, turnaround = 2h => the next slot must start >= (other_end + 2h).
function endOf(start: string): number {
  // returns minutes since midnight after 4h
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
  // almoco ends before jantar starts - 2h
  const maxAlmocoEnd = startMin(jantarStart) - 120;
  return ALMOCO_STARTS.filter((s) => startMin(s) + 4 * 60 <= maxAlmocoEnd);
}

function classifyStart(start: string): Slot | null {
  const hhmm = start.slice(0, 5);
  if (ALMOCO_STARTS.includes(hhmm)) return "almoco";
  if (JANTAR_STARTS.includes(hhmm)) return "jantar";
  return null;
}

function formatBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function nextWeekends(fromIso: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(fromIso + "T00:00:00Z");
  let safety = 0;
  while (out.length < count && safety < 120) {
    d.setUTCDate(d.getUTCDate() + 1);
    safety++;
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) {
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  // --- GET: form config -------------------------------------------------
  if (req.method === "GET") {
    const u = new URL(req.url);
    const slug = u.searchParams.get("slug");
    if (!slug) return json({ error: "missing_slug" }, 400);
    const { data, error } = await admin
      .from("forms")
      .select("name, welcome_message, active, attendant_name, attendant_avatar_url, attendant_online, privacy_policy_url")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "form_not_found" }, 404);
    return json(data);
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // --- POST: lead intake ------------------------------------------------
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const {
    form_slug,
    celebrant_name,
    celebrant_age,
    desired_date,
    parent_name,
    parent_phone,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    gbraid,
    wbraid,
    fbclid,
    fbp,
    fbc,
    landing_page,
    referrer,
    marketing_event_id,
  } = body || {};

  if (!form_slug || !celebrant_name || !celebrant_age || !desired_date || !parent_name || !parent_phone) {
    return json({ error: "missing_fields" }, 400);
  }


  // a) Form
  const { data: form, error: fErr } = await admin
    .from("forms")
    .select("id, tenant_id, unit_id, source, utm_campaign, active")
    .eq("slug", form_slug)
    .maybeSingle();
  if (fErr) return json({ error: fErr.message }, 500);
  if (!form || !form.active) return json({ error: "form_not_found" }, 404);

  // b) Client by phone
  let clientId: string | null = null;
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("tenant_id", form.tenant_id)
    .eq("phone", parent_phone)
    .maybeSingle();
  if (existing?.id) {
    clientId = existing.id;
  } else {
    const { data: created, error: cErr } = await admin
      .from("clients")
      .insert({
        tenant_id: form.tenant_id,
        unit_id: form.unit_id,
        full_name: parent_name,
        phone: parent_phone,
        status: "lead",
        source: form.source,
      })
      .select("id")
      .single();
    if (cErr) return json({ error: cErr.message }, 500);
    clientId = created.id;
  }

  // c) Opportunity — generate lead_event_id for ad platform deduplication
  const finalCampaign = utm_campaign || form.utm_campaign || null;
  const leadEventId = crypto.randomUUID();
  const { data: opp, error: oErr } = await admin
    .from("opportunities")
    .insert({
      tenant_id: form.tenant_id,
      unit_id: form.unit_id,
      client_id: clientId,
      celebrant_name,
      celebrant_age,
      desired_date,
      desired_slot: null,
      stage: "em_conversa",
      source: form.source,
      form_id: form.id,
      form_slug,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: finalCampaign,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      gclid: gclid || null,
      gbraid: gbraid || null,
      wbraid: wbraid || null,
      fbclid: fbclid || null,
      fbp: fbp || null,
      fbc: fbc || null,
      landing_page: landing_page || null,
      referrer: referrer || null,
      marketing_event_id: marketing_event_id || null,
      lead_event_id: leadEventId,
      first_response_at: new Date().toISOString(),
      stage_changed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (oErr) return json({ error: oErr.message }, 500);


  // d) Date check
  const { data: confirmed } = await admin
    .from("contracts")
    .select("event_start_time")
    .eq("tenant_id", form.tenant_id)
    .eq("event_date", desired_date)
    .eq("status", "assinado");

  const { data: preres } = await admin
    .from("opportunities")
    .select("desired_slot")
    .eq("tenant_id", form.tenant_id)
    .eq("desired_date", desired_date)
    .eq("stage", "pre_reserva")
    .gt("pre_reserva_expires_at", new Date().toISOString());

  // Compute confirmed slots
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

  // After applying compatibility: if one slot is confirmed, the other may be reduced/blocked
  if (almocoStart) {
    const compat = compatibleJantarStarts(almocoStart);
    if (compat.length === 0) jantarBlocked = true;
  }
  if (jantarStart) {
    const compat = compatibleAlmocoStarts(jantarStart);
    if (compat.length === 0) almocoBlocked = true;
  }

  // Pre-reservas
  const preAlmoco = (preres || []).some((p) => p.desired_slot === "almoco");
  const preJantar = (preres || []).some((p) => p.desired_slot === "jantar");

  let dateStatus: "available" | "pre_reserved" | "fully_booked";
  let alternatives: string[] = [];

  if (almocoBlocked && jantarBlocked) {
    dateStatus = "fully_booked";
    alternatives = nextWeekends(desired_date, 3);
  } else if ((!almocoBlocked && preAlmoco) || (!jantarBlocked && preJantar)) {
    // The free slot(s) are pre-reserved by someone else
    const anyFreeWithoutPre =
      (!almocoBlocked && !preAlmoco) || (!jantarBlocked && !preJantar);
    dateStatus = anyFreeWithoutPre ? "available" : "pre_reserved";
  } else {
    dateStatus = "available";
  }

  const dateBR = formatBR(desired_date);
  let whatsappStub = "";
  if (dateStatus === "available") {
    whatsappStub = `Boa notícia, ${parent_name}! 🎉 A data ${dateBR} está disponível para a festa do(a) ${celebrant_name}. Para garantir, vamos agendar uma visita ao buffet? É só responder aqui!`;
  } else if (dateStatus === "pre_reserved") {
    whatsappStub = `Olá, ${parent_name}! A data ${dateBR} tem uma pré-reserva. Nosso time vai verificar e entra em contato com você em breve!`;
  } else {
    const [a1, a2, a3] = alternatives.map(formatBR);
    whatsappStub = `Olá, ${parent_name}! Infelizmente ${dateBR} já está reservado. Mas tenho essas datas disponíveis: ${a1}, ${a2} e ${a3}. Alguma funciona para a festa do(a) ${celebrant_name}?`;
  }

  console.log("WHATSAPP_STUB:", whatsappStub);

  return json({
    success: true,
    opportunity_id: opp.id,
    date_status: dateStatus,
    whatsapp_stub: whatsappStub,
  });
});
