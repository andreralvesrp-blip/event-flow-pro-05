// Shared Clicksign payload parser — Phase 2.4
// New Kids Point template: full persistence + structured installments.
// Idempotent on (tenant_id, clicksign_document_key).
//
// Matching policy: strict exact-label match after normalization
// (lowercase, accents stripped, non-alphanumerics removed). No fuzzy/substring.

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

/**
 * Coerce a raw answer value to a string.
 * - Arrays are joined with newlines (preserves multi-line fields like "Parcelas"
 *   and multi-select like "Forma de pagamento").
 * - Objects fall back to JSON.
 */
function answerToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n").trim();
  }
  return JSON.stringify(v);
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
        const str = answerToString(v);
        if (!str) continue;
        if (merged[key] === undefined) merged[key] = str;
      }
    }
  }
  return merged;
}

/** Exact (normalized) lookup — no fuzzy match. */
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
  m = s.match(/^(\d{1,2})$/);
  if (m) return `${m[1].padStart(2, "0")}:00:00`;
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

/** "À vista" → 1, "Em 2x" → 2, "3x" → 3, "10 parcelas" → 10, "1".."12" → number. */
function normInstallments(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\ba\s*vista\b/.test(lower) || /\bavista\b/.test(lower)) return 1;
  const m = lower.match(/(\d+)\s*x/) ?? lower.match(/(\d+)\s*parcela/) ?? lower.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Normalize a single payment-method token to canonical label. */
function normMethodToken(raw: string): string {
  const k = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!k) return "";
  if (/pix/.test(k)) return "PIX";
  if (/cart/.test(k) || /credit/.test(k) || /debit/.test(k)) return "Cartão";
  if (/dinheiro|especie/.test(k)) return "Dinheiro";
  if (/transf|\bted\b|doc\b/.test(k)) return "Transf/TED";
  // keep original capitalisation if unknown
  return raw.trim();
}

/**
 * Normalize "Forma de pagamento". Accepts:
 *   - "PIX"
 *   - "PIX, Cartão"
 *   - "PIX\nCartão"
 *   - already-joined "PIX + Cartão"
 *   - array (already joined by newline upstream)
 * Returns canonical "A + B + C".
 */
function normPaymentMethod(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const parts = raw.split(/[\n,;|+\/]+/).map((p) => normMethodToken(p)).filter(Boolean);
  if (!parts.length) return raw;
  // de-dup preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out.join(" + ");
}

// ---------- "Parcelas" parser ----------

export type ParsedInstallment = {
  order_index: number;
  due_date: string;     // YYYY-MM-DD
  amount: number;
  payment_method: string;
  raw_line: string;
};

/**
 * Parse the multi-line "Parcelas" field. Expected per-line format:
 *   DD/MM/AAAA - R$ 0.000,00 - MÉTODO
 * Lenient on separators (- or –), spaces, and missing R$.
 */
export function parseInstallments(raw: string | null | undefined): ParsedInstallment[] {
  if (!raw) return [];
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedInstallment[] = [];
  let idx = 0;
  for (const line of lines) {
    // Find date
    const dateMatch = line.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})|(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const due = normDate(dateMatch[0]);
    if (!due) continue;
    // Find money (R$ 1.000,00 / 1000.00 / 1000,00)
    const moneyMatch = line.match(/R?\$?\s*([\d.,]+)/g);
    let amount: number | null = null;
    if (moneyMatch) {
      // Prefer the longest numeric token that isn't the date
      const candidates = moneyMatch
        .map((m) => m.replace(/^R?\$?\s*/, ""))
        .filter((m) => !/\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(m) && /[.,]/.test(m) === true || /^\d{2,}$/.test(m));
      for (const c of candidates) {
        const n = normMoney(c);
        if (n !== null && n > 0) { amount = n; break; }
      }
    }
    if (amount === null) continue;
    // Method = trailing token after last separator
    const parts = line.split(/\s+[-–]\s+/);
    const methodRaw = parts.length >= 3 ? parts[parts.length - 1] : "";
    const method = normMethodToken(methodRaw) || "PIX";
    idx += 1;
    out.push({
      order_index: idx,
      due_date: due,
      amount,
      payment_method: method,
      raw_line: line,
    });
  }
  return out;
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
): Promise<{ contract_id: string; client_id: string; warnings: string[] }> {
  const warnings: string[] = [];
  const { eventName, documentKey, rawStatus } = extractTopLevel(payload);
  if (!documentKey) throw new Error("document_key não encontrado no payload");

  const answers = getAnswers(payload);
  const signers = (pick<unknown[]>(payload, "document.signers", "signers", "data.document.signers") ?? []) as Json[];

  const cpfRaw = exact(answers, ["CPF"]);
  const cpf = normCpf(
    cpfRaw ?? signers.map((s) => (s as Json).documentation ?? (s as Json).cpf).find(Boolean),
  );
  if (!cpf) throw new Error("CPF não encontrado no payload");

  const primarySigner = signers.find(
    (s) => normCpf((s as Json).documentation ?? (s as Json).cpf) === cpf,
  ) ?? signers[0] ?? {};

  // ----- CLIENT -----
  // Email: ONLY "E-mail Contratante" (NEVER "E-mail Contratada").
  // Fallback to signer email only when contratante is empty.
  const contratanteEmail = exact(answers, ["E-mail Contratante", "E-mail do cliente"]);
  const clientEmail = contratanteEmail ?? (primarySigner.email as string | undefined) ?? null;

  const clientData: Json = {
    tenant_id: tenantId,
    cpf,
    full_name: exact(answers, ["Nome completo"]) ?? (primarySigner.name as string) ?? "Sem nome",
    email: clientEmail,
    phone: normPhone(exact(answers, ["Celular"]) ?? primarySigner.phone_number),
    address_full: exact(answers, ["Endereço completo (com CEP)", "Endereço completo"]),
    mother_name: exact(answers, ["Nome da mamãe"]),
    father_name: exact(answers, ["Nome do papai"]),
    how_met: exact(answers, ["Como conheceu", "Como conheceu o buffet"]),
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

  // ----- CONTRACT -----
  const paymentScheduleRaw = exact(answers, ["Parcelas", "Data + Valor + Forma de pagamento"]);
  const totalValue = normMoney(exact(answers, ["Valor (R$)", "Valor fechado (R$)"]));
  const installmentCount = normInstallments(exact(answers, ["Parcelamento"]));

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
    guest_count: normInt(exact(answers, ["Nº convidados", "N convidados", "Numero de convidados"])),
    celebrant_name: exact(answers, ["Aniversariante"]),
    celebrant_age: normInt(exact(answers, ["Idade"])),
    decoration: exact(answers, ["Decoração"]),
    tasting_menu: exact(answers, ["Menu Degustação"]),
    hot_dish: exact(answers, ["Prato Quente"]),
    cake: exact(answers, ["Bolo"]),
    kids_menu: exact(answers, ["Prato Kids"]),
    observations: exact(answers, ["Observações"]),
    additional_services: exact(answers, ["Serviços Adicionais"]),
    children_pay_from_age: normInt(exact(answers, ["Crianças pagam a partir de"])),
    contract_form_date: normDate(exact(answers, ["Data de hoje"])),
    contracted_company_email: exact(answers, ["E-mail Contratada"]),

    total_value: totalValue,
    installment_count: installmentCount,
    payment_method: normPaymentMethod(exact(answers, ["Forma de pagamento", "Formato de pagamento"])),
    payment_schedule_raw: paymentScheduleRaw,

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

  // ----- INSTALLMENTS (idempotent: delete + recreate) -----
  const parsed = parseInstallments(paymentScheduleRaw);

  const { error: delErr } = await admin
    .from("contract_installments")
    .delete()
    .eq("contract_id", contractId);
  if (delErr) warnings.push(`Falha ao limpar parcelas antigas: ${delErr.message}`);

  if (parsed.length === 0) {
    if (paymentScheduleRaw) {
      warnings.push("Campo Parcelas presente mas nenhuma linha pôde ser interpretada");
    } else {
      warnings.push("Campo Parcelas vazio; nenhuma parcela gerada");
    }
  } else {
    const rows = parsed.map((p) => ({
      tenant_id: tenantId,
      contract_id: contractId,
      order_index: p.order_index,
      due_date: p.due_date,
      amount: p.amount,
      payment_method: p.payment_method,
      paid: false,
      payment_status: "pendente",
      charge_customer: true,
      card_installments: null,
      raw_line: p.raw_line,
    }));
    const { error: insErr } = await admin.from("contract_installments").insert(rows);
    if (insErr) warnings.push(`Falha ao inserir parcelas: ${insErr.message}`);
  }

  // ----- Financial validations (warnings only) -----
  const sum = parsed.reduce((acc, p) => acc + p.amount, 0);
  if (totalValue !== null && parsed.length > 0) {
    const diff = Math.abs(sum - totalValue);
    if (diff > 0.01) {
      warnings.push(`Warning financeiro: total_value=${totalValue.toFixed(2)}, soma_parcelas=${sum.toFixed(2)}`);
    }
  }
  if (installmentCount !== null && parsed.length > 0 && parsed.length !== installmentCount) {
    warnings.push(`Warning financeiro: installment_count=${installmentCount}, parcelas_geradas=${parsed.length}`);
  }

  return { contract_id: contractId, client_id: clientId, warnings };
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
