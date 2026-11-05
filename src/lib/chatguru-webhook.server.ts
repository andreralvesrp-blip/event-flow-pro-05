// Server-only: envia o lead ao webhook do ChatGuru (canal WhatsApp).
// Só para o formulário bs-orcamento-teste com WhatsApp ativo. A URL fica no
// secret CHATGURU_WEBHOOK_URL e nunca sai do servidor nem é gravada.

export const CHATGURU_FORM = "bs-orcamento-teste";
const TIMEOUT_MS = 6000;

export type ChatguruPayload = {
  evento: "novo_orcamento";
  unidade: "bosque" | "vila" | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  data_festa: string;
  link_datas: string | null;
  origem: string | null;
  id_oportunidade: string;
  teste: true;
};

const formatBR = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
/** Primeiro nome e sobrenome (último nome) informados. */
export const firstAndLast = (full: string | null | undefined) => {
  const p = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return p.length <= 1 ? p[0] ?? "" : `${p[0]} ${p[p.length - 1]}`;
};

export function buildChatguruPayload(input: {
  opportunityId: string; unitSlug: string | null; fullName: string | null; phone: string | null;
  email: string | null; desiredDate: string | null; link: string | null; source: string | null;
}): ChatguruPayload {
  return {
    evento: "novo_orcamento",
    unidade: input.unitSlug === "bosque-da-saude" ? "bosque" : input.unitSlug === "vila-mariana" ? "vila" : null,
    nome: firstAndLast(input.fullName),
    telefone: input.phone,
    email: input.email,
    data_festa: formatBR(input.desiredDate),
    link_datas: input.link,
    origem: input.source,
    id_oportunidade: input.opportunityId,
    teste: true,
  };
}

/** Cria o link pessoal de datas (só o hash do token fica gravado). Retorna null se falhar. */
export async function createPersonalLink(tenantId: string, opportunityId: string, baseUrl: string): Promise<string | null> {
  try {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { newPersonalToken, tokenHash } = await import("./personal-calendar.server");
    const token = newPersonalToken();
    const { error } = await db.from("date_personal_links").insert({ tenant_id: tenantId, opportunity_id: opportunityId, token_hash: await tokenHash(token) });
    if (error) { console.error("[personal-link] error", error.message); return null; }
    return `${baseUrl.replace(/\/$/, "")}/datas/${token}`;
  } catch (e) {
    console.error("[personal-link] error", (e as Error).message);
    return null;
  }
}

/** Envia uma única vez (sem nova tentativa automática) e registra em quote_sends. */
export async function sendChatguruWebhook(opportunityId: string, baseUrl: string, presetLink?: string | null): Promise<"enviado" | "falhou"> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: opp } = await db.from("opportunities")
    .select("id, tenant_id, unit_id, client_id, desired_date, email, form_slug, source, contact_name")
    .eq("id", opportunityId).maybeSingle();
  if (!opp || opp.form_slug !== CHATGURU_FORM) return "falhou";
  const [{ data: client }, { data: unit }] = await Promise.all([
    db.from("clients").select("full_name, phone_normalized, email").eq("id", opp.client_id).maybeSingle(),
    db.from("units").select("slug").eq("id", opp.unit_id ?? "").maybeSingle(),
  ]);

  let status: "enviado" | "falhou" = "falhou";
  let response: string | null = null;
  let error: string | null = null;
  let payload: ChatguruPayload | null = null;
  try {
    // Link pessoal de datas: token aleatório; só o hash fica gravado.
    // Se o disparo já gerou o link (o mesmo do e-mail), reutiliza; senão cria.
    const link = presetLink !== undefined ? presetLink : await createPersonalLink(opp.tenant_id, opp.id, baseUrl);
    payload = buildChatguruPayload({
      opportunityId: opp.id, unitSlug: unit?.slug ?? null, fullName: (opp as any).contact_name || client?.full_name || null,
      phone: client?.phone_normalized ?? null, email: opp.email || client?.email || null,
      desiredDate: opp.desired_date, link, source: opp.source ?? null,
    });
    const url = process.env.CHATGURU_WEBHOOK_URL;
    if (!url) throw new Error("CHATGURU_WEBHOOK_URL não configurado");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = (await res.text()).slice(0, 1500);
    response = `HTTP ${res.status}: ${text}`;
    if (res.ok) status = "enviado";
    else error = `webhook respondeu HTTP ${res.status}`;
  } catch (e) {
    const err = e as Error;
    error = err.name === "TimeoutError" ? `sem resposta em ${TIMEOUT_MS / 1000}s` : err.message;
  }
  // Nunca grava a URL; o link pessoal aparece só no corpo enviado (com token).
  const { error: logErr } = await db.from("quote_sends").insert({
    tenant_id: opp.tenant_id,
    opportunity_id: opp.id,
    channel: "whatsapp",
    status,
    recipient: client?.phone_normalized ?? null,
    provider_response: JSON.stringify({ resposta: response, erro: error, enviado: payload && { ...payload, link_datas: payload.link_datas ? "(link pessoal gerado)" : null } }),
    sent_at: status === "enviado" ? new Date().toISOString() : null,
  } as never);
  if (logErr) console.error("[chatguru] log error", logErr.message);
  return status;
}
