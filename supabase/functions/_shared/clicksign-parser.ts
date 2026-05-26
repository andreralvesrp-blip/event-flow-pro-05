// Shared Clicksign payload parser — Phase 2.3 (Kids Point deterministic mapping)
// Idempotent on (tenant_id, clicksign_document_key).
//
// Matching policy:
// - Each DB field maps to ONE canonical Clicksign field label (exact match
//   after normalization: lowercase, accents stripped, non-alphanumerics removed).
// - A small list of alternates is allowed only for backwards-compat; they are
//   also exact (normalized) matches, not fuzzy substring matches.
// - NEVER use partial/substring matching for sensitive fields — that's what
//   caused "E-mail Kids Point" to fill clients.email and risked "Data de hoje"
//   filling event_date.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type Json = Record<string, unknown>;

// ---------- generic helpers ----------

export function deepGet<T = unknown>(obj: unknown, path: string): T | null {
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

export function pick<T = unknown>(obj: unknown, ...paths: string[]): T | null {
  for (const p of paths) {
    const v = deepGet<T>(obj, p);
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function normKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

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

/**
 * Exact (normalized) lookup. Tries each label in order and returns the first
 * present non-empty value. There is NO substring or fuzzy match — labels must
 * match exactly after accent/case/punctuation normalization. This guarantees
 * "E-mail Kids Point" never collides with "E-mail do cliente".
 */
function exact(answers: Record<string, string>, labels: string[]): string | null {
  for (const label of labels) {
    const v = answers[normKey(label)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
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
  const d = digits(s); if (!d) return null;
  return d.length >= 11 ? d.slice(0, 11) : d;
}
function normPhone(s: unknown): string | null { return digits(s); }

function normDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normTime(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase(); if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
  m = s.match(/^(\d{1,2})h(\d{0,2})/);
  if (m) return `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}:00`;
  return null;
}

function normMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[^\d.,-]/g, ""); if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s); return isNaN(n) ? null : n;
}

function normInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Math.trunc(v);
  const m = String(v).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function toIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString();
}

/** "À vista" → 1, "Em 2x" → 2, "3x" → 3, "10 parcelas" → 10. */
function normInstallments(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\ba\s*vista\b/.test(lower) || /\bavista\b/.test(lower)) return 1;
  const m = lower.match(/(\d+)\s*x/) ?? lower.match(/(\d+)\s*parcela/) ?? lower.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Normalize "Formato de pagamento" to a canonical label. */
function normPaymentMethod(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const k = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hasPix = /\bpix\b/.test(k);
  const hasCard = /\bcart(ao|ão)?\b/.test(k) || /\bcredit/.test(k) || /\bdebit/.test(k);
  const hasCash = /\bdinheiro\b/.test(k) || /\bespecie\b/.test(k);
  if (hasPix && hasCard) return "PIX + cartão";
  if (hasPix) return "PIX";
  if (hasCard) return "Cartão";
  if (hasCash) return "Dinheiro";
  return raw; // keep original if it doesn't match any known canonical
}

// ---------- status mapping ----------

export function mapStatus(eventName: string | null, rawStatus: string | null): string {
  const bag = `${(eventName ?? "").toLowerCase()} ${(rawStatus ?? "").toLowerCase()}`;
  if (/(cancel|refus|reject|recus)/.test(bag)) return "cancelado";
  if (/(auto[_\s-]?close|document[_\s-]?closed|closed|close|sign(ed)?|complete|completed|finaliz|assinad|finish)/.test(bag)) return "assinado";
  return "aguardando_assinaturas";
}

export function extractTopLevel(payload: Json) {
  return {
    eventName: pick<string>(payload, "event.name", "event", "name") ?? null,
    documentKey: pick<string>(payload, "document.key", "document_key", "data.document.key", "key") ?? null,
    rawStatus: pick<string>(payload, "document.status", "status", "data.document.status") ?? null,
  };
}

// ---------- main processor ----------

export async function processClicksignPayload(
  admin: SupabaseClient,
  tenantId: string,
  payload: Json,
): Promise<{ contract_id: string; client_id: string }> {
  const { eventName, documentKey, rawStatus } = extractTopLevel(payload);
  if (!documentKey) throw new Error("document_key não encontrado no payload");

  const answers = getAnswers(payload);
  const signers = (pick<unknown[]>(payload, "document.signers", "signers", "data.document.signers") ?? []) as Json[];

  // CPF — exact label "CPF"
  const cpfRaw = exact(answers, ["CPF"]);
  const cpf = normCpf(
    cpfRaw ?? signers.map((s) => (s as Json).documentation ?? (s as Json).cpf).find(Boolean),
  );
  if (!cpf) throw new Error("CPF não encontrado no payload");

  const primarySigner = signers.find(
    (s) => normCpf((s as Json).documentation ?? (s as Json).cpf) === cpf,
  ) ?? signers[0] ?? {};

  // ----- CLIENT (exact-match deterministic mapping) -----
  // Email: ONLY "E-mail do cliente". NEVER "E-mail Kids Point".
  // Signer email is a last-resort fallback if the client email field is empty.
  const clientEmail = exact(answers, ["E-mail do cliente"]) ?? (primarySigner.email as string | undefined) ?? null;

  const clientData: Json = {
    tenant_id: tenantId,
    cpf,
    full_name: exact(answers, ["Nome completo"]) ?? (primarySigner.name as string) ?? "Sem nome",
    email: clientEmail,
    phone: normPhone(exact(answers, ["Celular"]) ?? primarySigner.phone_number),
    address_full: exact(answers, ["Endereço completo (com CEP)"]),
    mother_name: exact(answers, ["Nome da mamãe"]),
    father_name: exact(answers, ["Nome do papai"]),
    how_met: exact(answers, ["Como conheceu o buffet", "Como conheceu"]),
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

  // ----- CONTRACT (exact-match deterministic mapping) -----
  // event_date: ONLY "Data da festa". NEVER "Data de hoje".
  // installment_count: ONLY "Parcelamento". NEVER "Formato de pagamento".
  // payment_method:    ONLY "Formato de pagamento". NEVER "Parcelamento"
  //                    nor "Data + Valor + Forma de pagamento".
  const contractData: Json = {
    tenant_id: tenantId,
    client_id: clientId,
    clicksign_document_key: documentKey,
    clicksign_template_name: pick<string>(payload, "document.template.name", "template.name") ?? null,
    clicksign_signed_pdf_url: pick<string>(payload, "document.downloads.signed_file_url", "document.signed_file_url", "signed_file_url"),
    status: mapStatus(eventName, rawStatus),

    event_date: normDate(exact(answers, ["Data da festa"])),
    event_weekday_raw: exact(answers, ["Dia da semana"]),
    event_start_time: normTime(exact(answers, ["Horário de início"])),
    event_end_time: normTime(exact(answers, ["Horário de término"])),
    guest_count: normInt(exact(answers, ["Nº convidados"])),
    celebrant_name: exact(answers, ["Aniversariante"]),
    celebrant_age: normInt(exact(answers, ["Idade"])),
    decoration: exact(answers, ["Decoração"]),
    cake: exact(answers, ["Bolo"]),
    hot_dish: exact(answers, ["Prato Quente"]),
    observations: exact(answers, ["Observações"]),
    children_pay_from_age: normInt(exact(answers, ["Crianças pagam a partir de"])),

    total_value: normMoney(exact(answers, ["Valor fechado (R$)"])),
    installment_count: normInstallments(exact(answers, ["Parcelamento"])),
    payment_method: normPaymentMethod(exact(answers, ["Formato de pagamento"])),
    payment_schedule_raw: exact(answers, ["Data + Valor + Forma de pagamento"]),
    contract_form_date: normDate(exact(answers, ["Data de hoje"])),

    // tasting_menu intentionally omitted — not present in Kids Point template.

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
      if (uErr) throw new Error(`contract update failed: ${uErr.message}`);
    }
  } else {
    const { data: created, error: ctErr } = await admin.from("contracts").insert(contractData).select("id").single();
    if (ctErr || !created) throw new Error(`contract insert failed: ${ctErr?.message}`);
    contractId = created.id;
  }

  return { contract_id: contractId, client_id: clientId };
}

// ---------- HMAC SHA256 validator (hex) ----------
export async function verifyHmacSha256(rawBody: string, secret: string, signatureHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const bytes = new Uint8Array(sig);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const a = hex.toLowerCase();
  const b = signatureHex.toLowerCase().replace(/^sha256=/, "").trim();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
