// Clicksign webhook receiver — Phase 2.1
// Parses real Clicksign payloads where form answers live in document.template.data
// with Portuguese keys. Idempotent on (tenant_id, clicksign_document_key).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TENANT_SLUG = "kids-point";

type Json = Record<string, unknown>;

// ---------- generic helpers ----------

function deepGet<T = unknown>(obj: unknown, path: string): T | null {
  if (!obj) return null;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Json)) {
      cur = (cur as Json)[p];
    } else return null;
  }
  return (cur ?? null) as T | null;
}

function pick<T = unknown>(obj: unknown, ...paths: string[]): T | null {
  for (const p of paths) {
    const v = deepGet<T>(obj, p);
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ""); // strip spaces, punctuation
}

// ---------- answers extractor ----------

function getAnswers(payload: Json): Record<string, string> {
  const candidates: unknown[] = [
    deepGet(payload, "document.template.data"),
    deepGet(payload, "document.form.answers"),
    deepGet(payload, "data.document.template.data"),
    deepGet(payload, "data.document.form.answers"),
    deepGet(payload, "answers"),
  ];
  const merged: Record<string, string> = {};
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      for (const [k, v] of Object.entries(c as Json)) {
        if (v === null || v === undefined) continue;
        const key = normKey(String(k));
        if (!key) continue;
        if (merged[key] === undefined) {
          merged[key] = typeof v === "string" ? v.trim() : String(v);
        }
      }
    }
  }
  return merged;
}

function fa(answers: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = answers[normKey(k)];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

// ---------- normalizers ----------

function digits(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  const d = String(s).replace(/\D/g, "");
  return d.length ? d : null;
}

function normCpf(s: unknown): string | null {
  const d = digits(s);
  if (!d) return null;
  return d.length >= 11 ? d.slice(0, 11) : d;
}

function normPhone(s: unknown): string | null {
  return digits(s);
}

function normDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normTime(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  // HH:mm or HH:mm:ss
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2];
    const ss = m[3] ?? "00";
    return `${hh}:${mm}:${ss}`;
  }
  // "15h" or "15h00" or "15h30min"
  m = s.match(/^(\d{1,2})h(\d{0,2})/);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = (m[2] || "00").padStart(2, "0");
    return `${hh}:${mm}:00`;
  }
  return null;
}

function normMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  // If both , and . present, assume . is thousands, , is decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function normInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Math.trunc(v);
  const m = String(v).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function toIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function mapStatus(eventName: string | null, rawStatus: string | null): string {
  const bag = `${(eventName ?? "").toLowerCase()} ${(rawStatus ?? "").toLowerCase()}`;
  if (/(cancel|refus|reject|recus)/.test(bag)) return "cancelado";
  if (/(auto[_\s-]?close|document[_\s-]?closed|closed|close|sign(ed)?|complete|completed|finaliz|assinad|finish)/.test(bag)) {
    return "assinado";
  }
  return "aguardando_assinaturas";
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let payload: Json = {};
  try {
    const txt = await req.text();
    payload = txt ? JSON.parse(txt) : {};
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tenant } = await admin
    .from("tenants").select("id").eq("slug", TENANT_SLUG).maybeSingle();
  if (!tenant) {
    return new Response(JSON.stringify({ error: "tenant not found" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = tenant.id as string;

  const { data: secretRow } = await admin
    .from("system_settings").select("value")
    .eq("tenant_id", tenantId).eq("key", "clicksign_webhook_secret").maybeSingle();
  const expected = (secretRow?.value ?? "").trim();
  const provided = (req.headers.get("x-webhook-secret") ?? "").trim();
  if (expected && provided !== expected) {
    return new Response(JSON.stringify({ error: "invalid secret" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventName = pick<string>(payload, "event.name", "event", "name") ?? null;
  const documentKey = pick<string>(payload, "document.key", "document_key", "data.document.key", "key") ?? null;
  const rawStatus = pick<string>(payload, "document.status", "status", "data.document.status") ?? null;

  const { data: eventRow, error: insErr } = await admin
    .from("clicksign_webhook_events").insert({
      tenant_id: tenantId, event_name: eventName, document_key: documentKey,
      status: rawStatus, payload, processed: false,
    }).select("id").single();
  if (insErr || !eventRow) {
    return new Response(JSON.stringify({ error: "log failed", detail: insErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const eventId = eventRow.id as string;

  const markError = (m: string) => admin.from("clicksign_webhook_events").update({
    processing_error: m, processed: false, processed_at: new Date().toISOString(),
  }).eq("id", eventId);
  const markOk = () => admin.from("clicksign_webhook_events").update({
    processed: true, processing_error: null, processed_at: new Date().toISOString(),
  }).eq("id", eventId);

  try {
    if (!documentKey) {
      await markError("document_key não encontrado no payload");
      return new Response(JSON.stringify({ ok: true, warning: "no document_key" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answers = getAnswers(payload);
    const signers = (pick<unknown[]>(payload, "document.signers", "signers", "data.document.signers") ?? []) as Json[];

    // ---- client ----
    const cpf = normCpf(
      fa(answers, ["CPF", "cpf", "Documento", "documentation", "CPF do contratante"])
      ?? signers.map((s) => (s as Json).documentation ?? (s as Json).cpf).find(Boolean),
    );

    if (!cpf) {
      await markError("CPF não encontrado no payload");
      return new Response(JSON.stringify({ ok: true, warning: "no cpf" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const primarySigner = signers.find(
      (s) => normCpf((s as Json).documentation ?? (s as Json).cpf) === cpf,
    ) ?? signers[0] ?? {};

    const clientData: Json = {
      tenant_id: tenantId,
      cpf,
      full_name:
        fa(answers, ["Nome completo", "Nome do contratante", "Contratante", "nome_completo", "full_name", "nome"])
        ?? (primarySigner.name as string) ?? "Sem nome",
      email:
        fa(answers, ["E-mail", "Email", "email", "E-mail do contratante"])
        ?? (primarySigner.email as string) ?? null,
      phone: normPhone(
        fa(answers, ["Telefone", "Celular", "WhatsApp", "phone", "phone_number"])
        ?? primarySigner.phone_number,
      ),
      address_full:
        fa(answers, ["Endereço", "Endereco", "Endereço completo", "Endereço completo (com CEP)", "address", "address_full"]),
      mother_name: fa(answers, ["Nome da mãe", "Nome da mae", "Nome da mamãe", "Nome da mamae", "Mãe", "Mae", "mother_name"]),
      father_name: fa(answers, ["Nome do pai", "Nome do papai", "Pai", "father_name"]),
      how_met: fa(answers, ["Como conheceu", "Como nos conheceu", "how_met"]),
    };

    let clientId: string;
    const { data: existing } = await admin.from("clients").select("id")
      .eq("tenant_id", tenantId).eq("cpf", cpf).maybeSingle();
    if (existing) {
      clientId = existing.id;
      const upd: Json = {};
      for (const [k, v] of Object.entries(clientData)) {
        if (v !== null && v !== undefined && k !== "tenant_id" && k !== "cpf") upd[k] = v;
      }
      if (Object.keys(upd).length) await admin.from("clients").update(upd).eq("id", clientId);
    } else {
      const { data: created, error: cErr } = await admin.from("clients").insert(clientData).select("id").single();
      if (cErr || !created) throw new Error(`client insert failed: ${cErr?.message}`);
      clientId = created.id;
    }

    // ---- contract ----
    const contractData: Json = {
      tenant_id: tenantId,
      client_id: clientId,
      clicksign_document_key: documentKey,
      clicksign_template_name: pick<string>(payload, "document.template.name", "template.name") ?? null,
      clicksign_signed_pdf_url: pick<string>(payload, "document.downloads.signed_file_url", "document.signed_file_url", "signed_file_url"),
      status: mapStatus(eventName, rawStatus),
      event_date: normDate(fa(answers, ["Data da festa", "Data do evento", "data_evento", "event_date"])),
      event_start_time: normTime(fa(answers, ["Horário de início", "Horario de inicio", "Hora início", "Hora inicio", "hora_inicio", "event_start_time"])),
      event_end_time: normTime(fa(answers, ["Horário de término", "Horario de termino", "Hora término", "Hora termino", "hora_fim", "event_end_time"])),
      guest_count: normInt(fa(answers, ["Nº convidados", "No convidados", "Número de convidados", "Numero de convidados", "Convidados", "numero_convidados", "guest_count"])),
      celebrant_name: fa(answers, ["Nome do aniversariante", "Aniversariante", "aniversariante", "celebrant_name"]),
      celebrant_age: normInt(fa(answers, ["Idade do aniversariante", "Idade", "idade_aniversariante", "celebrant_age"])),
      decoration: fa(answers, ["Decoração", "Decoracao", "Tema", "Tema da festa", "decoracao", "decoration"]),
      cake: fa(answers, ["Bolo", "Sabor do bolo", "bolo", "cake"]),
      tasting_menu: fa(answers, ["Menu degustação", "Menu degustacao", "Degustação", "Degustacao", "menu_degustacao", "tasting_menu"]),
      hot_dish: fa(answers, ["Prato quente", "Prato Quente", "prato_quente", "hot_dish"]),
      observations: fa(answers, ["Observações", "Observacoes", "Observação", "Observacao", "notes", "observations"]),
      children_pay_from_age: normInt(fa(answers, ["Crianças pagam a partir de", "Criancas pagam a partir de", "Crianças pagantes a partir de", "Idade pagante", "children_pay_from_age"])),
      total_value: normMoney(fa(answers, ["Valor fechado (R$)", "Valor fechado", "Valor total", "valor_total", "total_value"])),
      installment_count: normInt(fa(answers, ["Nº de parcelas", "No de parcelas", "Numero de parcelas", "Número de parcelas", "Parcelas", "Parcelamento", "numero_parcelas", "installment_count"])),
      payment_method: fa(answers, ["Forma de pagamento", "Formato de pagamento", "Meio de pagamento", "Pagamento", "forma_pagamento", "payment_method"]),
      client_signed_at: toIsoDate(pick(payload, "document.signed_at", "document.client_signed_at")),
      manager_signed_at: toIsoDate(pick(payload, "document.manager_signed_at")),
      finalized_at: toIsoDate(pick(payload, "document.finished_at", "document.finalized_at", "occurred_at")),
      webhook_received_at: new Date().toISOString(),
      raw_webhook_payload: payload,
    };

    let contractId: string;
    const { data: existingC } = await admin.from("contracts").select("id")
      .eq("tenant_id", tenantId).eq("clicksign_document_key", documentKey).maybeSingle();
    if (existingC) {
      contractId = existingC.id;
      const upd: Json = {};
      for (const [k, v] of Object.entries(contractData)) {
        if (v !== null && v !== undefined && k !== "tenant_id" && k !== "clicksign_document_key") upd[k] = v;
      }
      if (Object.keys(upd).length) {
        const { error: uErr } = await admin.from("contracts").update(upd).eq("id", contractId);
        if (uErr) throw new Error(`contract update failed: ${uErr.message} | fields=${Object.keys(upd).join(",")}`);
      }
    } else {
      const { data: created, error: ctErr } = await admin.from("contracts").insert(contractData).select("id").single();
      if (ctErr || !created) throw new Error(`contract insert failed: ${ctErr?.message}`);
      contractId = created.id;
    }

    await markOk();
    return new Response(JSON.stringify({ ok: true, contract_id: contractId, client_id: clientId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[clicksign-webhook] processing error:", message);
    await markError(message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
