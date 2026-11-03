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
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const dots = (s.match(/\./g) ?? []).length;
  if (hasComma) {
    // Comma is decimal separator. Dots (if any) are thousand separators.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (dots >= 1) {
    if (dots > 1) {
      // Multiple dots and no comma → all dots are thousand separators.
      s = s.replace(/\./g, "");
    } else {
      // Single dot, ambiguous: decimal vs thousands.
      // Rule: 3 digits after dot → thousands; otherwise → decimal.
      const after = s.split(".")[1] ?? "";
      if (after.length === 3) s = s.replace(".", "");
      // else: leave as-is (e.g. "12000.00")
    }
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
  const BANK_INFO = /(cnpj|\bcpf\b|banco|ag[eê]ncia|\bconta\b|favorecid|dados\s+para\s+transfer|chave\s*pix|pix\s*cnpj|0001-|agencia:|conta:)/i;
  const ABSURD_AMOUNT = 200_000;
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedInstallment[] = [];
  let idx = 0;
  for (const line of lines) {
    // Skip pure bank-info lines (CNPJ/agência/conta/PIX details)
    if (BANK_INFO.test(line)) continue;
    // Find date and strip it from the rest of the line so it doesn't pollute
    // money extraction.
    const dateMatch = line.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})|(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const due = normDate(dateMatch[0]);
    if (!due) continue;
    const rest = line.replace(dateMatch[0], " ");

    // Prefer R$-prefixed money; else any decimal-looking number; else first int.
    let amount: number | null = null;
    const rPrefixed = rest.match(/R\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i);
    if (rPrefixed) amount = normMoney(rPrefixed[1]);
    if (amount === null) {
      const decimal = rest.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}|\d+,\d{2}/);
      if (decimal) amount = normMoney(decimal[0]);
    }
    if (amount === null) {
      const anyNum = rest.match(/\d+/);
      if (anyNum) amount = normMoney(anyNum[0]);
    }
    if (amount === null || amount <= 0) continue;
    if (amount >= ABSURD_AMOUNT) continue; // provável CNPJ/conta colado como valor

    // Method = trailing token after the last " - " / " – " / ":" separator.
    const parts = rest.split(/\s*[-–:|]\s*/).map((p) => p.trim()).filter(Boolean);
    const methodRaw = parts.length >= 2 ? parts[parts.length - 1] : "";
    // If the trailing part still looks like a number, no method was provided.
    const looksLikeMoney = /^R?\$?\s*[\d.,]+$/i.test(methodRaw);
    const method = (!looksLikeMoney && normMethodToken(methodRaw)) || "PIX";

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

async function processContractDocument(
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

  const internal = await loadInternalSigners(admin, tenantId);
  const primarySigner = signers.filter((s) => !isInternalSigner(s, internal)).find(
    (s) => normCpf((s as Json).documentation ?? (s as Json).cpf) === cpf,
  ) ?? signers[0] ?? {};

  // ----- Resolve fixed contracted company email (system_settings) -----
  const FALLBACK_CONTRACTED_EMAIL = "andre@buffetkidspoint.com.br";
  let contractedCompanyEmail = FALLBACK_CONTRACTED_EMAIL;
  try {
    const { data: setting } = await admin.from("system_settings")
      .select("value").eq("tenant_id", tenantId).eq("key", "contracted_company_email").maybeSingle();
    if (setting?.value && String(setting.value).trim()) {
      contractedCompanyEmail = String(setting.value).trim();
    } else {
      warnings.push("system_settings.contracted_company_email não encontrada; usando fallback");
    }
  } catch (e) {
    warnings.push(`Falha ao ler system_settings.contracted_company_email: ${(e as Error).message}`);
  }
  const contractedLc = contractedCompanyEmail.toLowerCase();
  const isContracted = (e: string | null | undefined) =>
    !!e && e.toLowerCase().trim() === contractedLc;

  // ----- CLIENT EMAIL resolution -----
  // A) "E-mail Contratante" do template (rejeitando se igual ao da contratada)
  // B) Signers filtrados (excluindo e-mail fixo da contratada):
  //    1 sobrando => usa; >1 => ambíguo (não escolhe); 0 => nenhum
  const contratanteEmail = exact(answers, ["E-mail Contratante", "E-mail do cliente"]);
  let clientEmail: string | null = null;
  if (contratanteEmail) {
    if (isContracted(contratanteEmail)) {
      warnings.push("E-mail Contratante igual ao e-mail fixo da contratada; ignorado");
    } else {
      clientEmail = contratanteEmail;
    }
  }
  if (!clientEmail) {
    const signerEmailsRaw = signers
      .map((s) => (s as Json).email)
      .filter((e): e is string => typeof e === "string" && e.trim() !== "");
    const candidates = Array.from(new Set(signerEmailsRaw.filter((e) => !isContracted(e))));
    if (candidates.length === 1) {
      clientEmail = candidates[0];
      if (!contratanteEmail) {
        warnings.push("E-mail Contratante não encontrado no template; usando signer único após excluir contratada");
      }
    } else if (candidates.length > 1) {
      warnings.push("E-mail Contratante não encontrado e múltiplos signers possíveis; fallback não aplicado por ambiguidade.");
    } else {
      warnings.push("E-mail Contratante não encontrado e nenhum signer válido após excluir e-mail da contratada.");
    }
  }

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
  const { data: existing } = await admin.from("clients")
    .select("id, email").eq("tenant_id", tenantId).eq("cpf", cpf).maybeSingle();
  if (existing) {
    clientId = existing.id;
    const existingEmail = (existing as { email: string | null }).email ?? null;
    const upd: Json = {};
    for (const [k, v] of Object.entries(clientData)) {
      if (k === "tenant_id" || k === "cpf") continue;
      if (k === "email") {
        // Nunca salvar o e-mail da contratada como cliente
        if (typeof v === "string" && isContracted(v)) continue;
        // Limpar legado: se o e-mail atual é o da contratada, sobrescrever
        if (existingEmail && isContracted(existingEmail)) {
          upd.email = (typeof v === "string" && v) ? v : null;
          continue;
        }
        // Só atualiza se houver e-mail novo claramente identificado e diferente
        if (typeof v === "string" && v && v !== existingEmail) {
          upd.email = v;
        }
        continue;
      }
      if (v !== null && v !== undefined) upd[k] = v;
    }
    if (Object.keys(upd).length) await admin.from("clients").update(upd).eq("id", clientId);
  } else {
    if (typeof clientData.email === "string" && isContracted(clientData.email as string)) {
      clientData.email = null;
    }
    const { data: created, error: cErr } = await admin.from("clients").insert(clientData).select("id").single();
    if (cErr || !created) throw new Error(`client insert failed: ${cErr?.message}`);
    clientId = created.id;
  }

  // ----- CONTRACT -----
  const paymentScheduleRaw = exact(answers, ["Parcelas", "Data + Valor + Forma de pagamento"]);
  const totalValue = normMoney(exact(answers, ["Valor (R$)", "Valor fechado (R$)"]));
  const installmentCount = normInstallments(exact(answers, ["Parcelamento"]));

  // Resolve unit_id explicitly:
  // 1) if there's an opportunity for this client, use opportunity.unit_id and link it
  // 2) otherwise fall back to the client's unit_id
  let resolvedUnitId: string | null = null;
  let resolvedOpportunityId: string | null = null;
  let unitSource: "opportunity" | "client" | "none" = "none";
  {
    const { data: opp } = await admin.from("opportunities")
      .select("id, unit_id")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (opp && (opp as { unit_id: string | null }).unit_id) {
      resolvedOpportunityId = (opp as { id: string }).id;
      resolvedUnitId = (opp as { unit_id: string }).unit_id;
      unitSource = "opportunity";
    } else {
      const { data: cli } = await admin.from("clients")
        .select("unit_id").eq("id", clientId).maybeSingle();
      if (cli && (cli as { unit_id: string | null }).unit_id) {
        resolvedUnitId = (cli as { unit_id: string }).unit_id;
        unitSource = "client";
      }
    }
  }
  if (!resolvedUnitId) {
    warnings.push("Não foi possível resolver unit_id do contrato (sem opportunity nem client.unit_id).");
  } else {
    console.log(`[clicksign-parser] contract unit_id resolved from ${unitSource}: ${resolvedUnitId}`);
  }

  const contractData: Json = {
    tenant_id: tenantId,
    client_id: clientId,
    unit_id: resolvedUnitId,
    opportunity_id: resolvedOpportunityId,
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
    contracted_company_email: contractedCompanyEmail,

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

  // Fields that represent operational data subject to manual edits.
  // When contracts.manually_edited = true, webhooks must not overwrite these.
  const OPERATIONAL_FIELDS = new Set<string>([
    "event_date", "event_weekday_raw", "event_start_time", "event_end_time",
    "guest_count", "celebrant_name", "celebrant_age", "children_pay_from_age",
    "decoration", "tasting_menu", "hot_dish", "cake", "kids_menu",
    "observations", "additional_services", "contract_form_date",
    "contracted_company_email",
    "total_value", "installment_count", "payment_method", "payment_schedule_raw",
  ]);

  let contractId: string;
  let existingManuallyEdited = false;
  let existingManualStatusOverride = false;
  const { data: existingC } = await admin.from("contracts")
    .select("id, manually_edited, manual_status_override, status")
    .eq("tenant_id", tenantId).eq("clicksign_document_key", documentKey).maybeSingle();
  if (existingC) {
    contractId = (existingC as { id: string }).id;
    existingManuallyEdited = !!(existingC as { manually_edited?: boolean }).manually_edited;
    existingManualStatusOverride = !!(existingC as { manual_status_override?: boolean }).manual_status_override;
    const upd: Json = {};
    for (const [k, v] of Object.entries(contractData)) {
      if (v === null || v === undefined) continue;
      if (k === "tenant_id" || k === "clicksign_document_key") continue;
      // Preserve manual operational edits
      if (existingManuallyEdited && OPERATIONAL_FIELDS.has(k)) continue;
      // Preserve manual cancellation
      if (existingManualStatusOverride && k === "status") continue;
      upd[k] = v;
    }
    if (existingManuallyEdited) {
      warnings.push("Contrato possui edição manual; reprocessamento não sobrescreveu campos operacionais.");
    }
    if (existingManualStatusOverride && (existingC as { status?: string }).status === "cancelado") {
      warnings.push("Contrato cancelado manualmente; webhook não alterou status.");
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

  if (existingManuallyEdited) {
    warnings.push("Contrato possui edição manual; parcelas não foram recriadas pelo webhook.");
  } else {
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

// ---------- document kind routing ----------
// Only CONTRATO documents create/update contracts. Distrato cancels the
// original contract; aditivo is linked to it; unidentified → review log.

export type DocumentKind = "contrato" | "distrato" | "aditivo" | "desconhecido";

function normText(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classifyDocument(payload: Json): DocumentKind {
  const bag = normText([
    pick<string>(payload, "document.template.name", "template.name"),
    pick<string>(payload, "document.filename", "filename"),
    pick<string>(payload, "document.path", "path"),
  ].filter(Boolean).join(" "));
  if (/distrato|rescisao|cancelamento/.test(bag)) return "distrato";
  if (/aditivo|adendo/.test(bag)) return "aditivo";
  // A contract is only identifiable when it comes from the template (carries data).
  if (deepGet(payload, "document.template") || deepGet(payload, "data.document.template")) return "contrato";
  return "desconhecido";
}

async function findOriginalContract(
  admin: SupabaseClient, tenantId: string, payload: Json, documentKey: string, onlyActive: boolean,
): Promise<{ id: string | null; reason?: string }> {
  const signers = (pick<unknown[]>(payload, "document.signers", "signers", "data.document.signers") ?? []) as Json[];
  const { data: setting } = await admin.from("system_settings").select("value")
    .eq("tenant_id", tenantId).eq("key", "contracted_company_email").maybeSingle();
  const contracted = String(setting?.value ?? "andre@buffetkidspoint.com.br").trim().toLowerCase();
  const emails = Array.from(new Set(signers.map((s) => String(s.email ?? "").trim().toLowerCase())
    .filter((e) => e && e !== contracted)));
  if (!emails.length) return { id: null, reason: "sem e-mail de contratante nos signatários" };
  const { data: clients } = await admin.from("clients").select("id, email").eq("tenant_id", tenantId).in("email", emails);
  const ids = (clients ?? []).map((c) => c.id as string);
  if (!ids.length) return { id: null, reason: "nenhum cliente com esse e-mail" };
  let q = admin.from("contracts").select("id, status").eq("tenant_id", tenantId).in("client_id", ids)
    .neq("clicksign_document_key", documentKey);
  if (onlyActive) q = q.neq("status", "cancelado");
  const { data: cts } = await q;
  if (!cts?.length) return { id: null, reason: "nenhum contrato original encontrado" };
  if (cts.length > 1) return { id: null, reason: `${cts.length} contratos possíveis (ambíguo)` };
  return { id: cts[0].id as string };
}

// ---------- PDF avulso → contrato "assinado – dados pendentes" ----------

export function suggestFromFilename(name: string | null): Json {
  const out: Json = {};
  if (!name) return out;
  // ddmmyyyy[_ ]HHhMM  ou  yyyymmdd
  const a = name.match(/(\d{2})(\d{2})(20\d{2})[_\s-]*(\d{2})h?(\d{2})?/);
  const b = name.match(/(20\d{2})(\d{2})(\d{2})/);
  if (a && +a[1] <= 31 && +a[2] <= 12) {
    out.event_date = `${a[3]}-${a[2]}-${a[1]}`;
    if (a[4] && +a[4] < 24) out.event_start_time = `${a[4]}:${a[5] ?? "00"}`;
  } else if (b && +b[2] <= 12 && +b[3] <= 31) {
    out.event_date = `${b[1]}-${b[2]}-${b[3]}`;
  }
  if (Object.keys(out).length) out.source = "nome_do_arquivo";
  return out;
}

async function createPendingContract(
  admin: SupabaseClient, tenantId: string, payload: Json, documentKey: string,
): Promise<{ contract_id: string; client_id: string; warnings: string[] }> {
  const warnings: string[] = ["PDF avulso assinado: contrato criado com dados pendentes."];
  const signers = (pick<unknown[]>(payload, "document.signers", "signers", "data.document.signers") ?? []) as Json[];
  const { data: setting } = await admin.from("system_settings").select("value")
    .eq("tenant_id", tenantId).eq("key", "contracted_company_email").maybeSingle();
  const contracted = String(setting?.value ?? "andre@buffetkidspoint.com.br").trim().toLowerCase();
  const clientSigners = signers.filter((s) => String(s.email ?? "").trim().toLowerCase() !== contracted);
  const main = clientSigners[0] ?? {};
  const email = String(main.email ?? "").trim().toLowerCase() || null;

  // phone may only be in the sign events
  const events = (pick<unknown[]>(payload, "document.events") ?? []) as Json[];
  let phoneRaw: string | null = (main.phone_number as string) ?? null;
  for (const ev of events) {
    const sg = deepGet<Json>(ev, "data.signer");
    if (sg && String(sg.email ?? "").toLowerCase() === email && sg.phone_number) phoneRaw = String(sg.phone_number);
  }
  const phone = normPhone(phoneRaw);
  const last8 = (phone ?? "").replace(/\D/g, "").slice(-8);

  let clientId: string | null = null;
  if (email) {
    const { data } = await admin.from("clients").select("id").eq("tenant_id", tenantId).ilike("email", email).limit(1);
    clientId = (data?.[0]?.id as string) ?? null;
  }
  if (!clientId && last8.length === 8) {
    const { data } = await admin.from("clients").select("id, phone").eq("tenant_id", tenantId).ilike("phone", `%${last8.slice(0, 4)}%`);
    const hit = (data ?? []).find((c) => String(c.phone ?? "").replace(/\D/g, "").slice(-8) === last8);
    clientId = (hit?.id as string) ?? null;
  }
  if (!clientId) {
    const { data: created, error } = await admin.from("clients").insert({
      tenant_id: tenantId,
      full_name: (main.name as string) || email || "Sem nome",
      email, phone,
      cpf: normCpf(main.documentation) ?? null,
    }).select("id").single();
    if (error || !created) throw new Error(`client insert failed: ${error?.message}`);
    clientId = created.id as string;
    warnings.push("Cliente criado a partir do signatário.");
  }

  const path = pick<string>(payload, "document.path") ?? "";
  const fileName = path.split("/").pop() || pick<string>(payload, "document.filename") || null;
  const signedUrl = pick<string>(payload, "document.downloads.signed_file_url");

  // Save the signed PDF now (Clicksign links expire in minutes)
  let pdfPath: string | null = null;
  if (signedUrl) {
    try {
      const res = await fetch(signedUrl);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        pdfPath = `${tenantId}/${documentKey}.pdf`;
        const { error } = await admin.storage.from("contract-pdfs").upload(pdfPath, bytes, {
          contentType: "application/pdf", upsert: true,
        });
        if (error) { pdfPath = null; warnings.push(`Falha ao guardar PDF: ${error.message}`); }
      } else warnings.push(`Download do PDF falhou (${res.status})`);
    } catch (e) { warnings.push(`Download do PDF falhou: ${(e as Error).message}`); }
  }

  const finishedAt = pick<string>(payload, "document.finished_at", "event.occurred_at");
  const row: Json = {
    tenant_id: tenantId,
    client_id: clientId,
    clicksign_document_key: documentKey,
    status: "assinado",
    data_pending: true,
    signed_file_name: fileName,
    clicksign_signed_pdf_url: signedUrl,
    client_signed_at: finishedAt,
    raw_webhook_payload: payload,
    webhook_received_at: new Date().toISOString(),
    suggested_data: suggestFromFilename(fileName),
    suggested_at: new Date().toISOString(),
  };
  if (pdfPath) row.signed_pdf_path = pdfPath;

  const { data: existing } = await admin.from("contracts").select("id")
    .eq("tenant_id", tenantId).eq("clicksign_document_key", documentKey).maybeSingle();
  if (existing) {
    const { suggested_data: _s, suggested_at: _a, data_pending: _p, ...upd } = row;
    await admin.from("contracts").update(upd).eq("id", existing.id);
    return { contract_id: existing.id as string, client_id: clientId, warnings };
  }
  const { data: c, error: cErr } = await admin.from("contracts").insert(row).select("id").single();
  if (cErr || !c) throw new Error(`contract insert failed: ${cErr?.message}`);
  return { contract_id: c.id as string, client_id: clientId, warnings };
}

export type ClicksignResult = {
  contract_id: string | null;
  client_id: string | null;
  warnings: string[];
  document_kind: DocumentKind;
  linked_contract_id: string | null;
  needs_review: boolean;
};

export async function processClicksignPayload(
  admin: SupabaseClient, tenantId: string, payload: Json,
): Promise<ClicksignResult> {
  const kind = classifyDocument(payload);
  const { eventName, documentKey, rawStatus } = extractTopLevel(payload);
  if (!documentKey) throw new Error("document_key não encontrado no payload");

  if (kind === "contrato") {
    const r = await processContractDocument(admin, tenantId, payload);
    return { ...r, document_kind: kind, linked_contract_id: null, needs_review: false };
  }
  if (kind === "desconhecido") {
    if (mapStatus(eventName, rawStatus) !== "assinado") {
      return {
        contract_id: null, client_id: null, document_kind: kind, linked_contract_id: null, needs_review: false,
        warnings: ["PDF avulso ainda não assinado (ou cancelado): nenhum contrato criado."],
      };
    }
    const r = await createPendingContract(admin, tenantId, payload, documentKey);
    return { ...r, document_kind: "contrato", linked_contract_id: null, needs_review: true };
  }

  const signed = mapStatus(eventName, rawStatus) === "assinado";
  const orig = await findOriginalContract(admin, tenantId, payload, documentKey, kind === "distrato");
  if (!orig.id) {
    return {
      contract_id: null, client_id: null, document_kind: kind, linked_contract_id: null, needs_review: true,
      warnings: [`${kind}: contrato original não encontrado (${orig.reason}). Revisar.`],
    };
  }
  const warnings: string[] = [];
  if (kind === "distrato") {
    if (signed) {
      const { data: c } = await admin.from("contracts").select("status").eq("id", orig.id).single();
      if (c?.status !== "cancelado") {
        await admin.from("contracts").update({
          status: "cancelado", canceled_at: new Date().toISOString(),
          cancellation_reason: `Distrato Clicksign ${documentKey}`,
        }).eq("id", orig.id);
        warnings.push("Distrato assinado: contrato original cancelado.");
      }
    } else {
      warnings.push("Distrato ainda não assinado: contrato original mantido.");
    }
  } else {
    warnings.push("Aditivo vinculado ao contrato original; nenhum contrato novo criado.");
  }
  return { contract_id: null, client_id: null, document_kind: kind, linked_contract_id: orig.id, needs_review: false, warnings };
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
