// Clicksign webhook receiver — Phase 2
// Receives Clicksign payloads, stores raw event for audit, then attempts to
// extract/upsert client + contract + installments. Idempotent on document_key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TENANT_SLUG = "kids-point";

type Json = Record<string, unknown>;

function pick<T = unknown>(obj: Json | undefined | null, ...paths: string[]): T | null {
  if (!obj) return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = obj;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Json)) {
        cur = (cur as Json)[p];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== null && cur !== undefined && cur !== "") return cur as T;
  }
  return null;
}

function digits(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const d = s.replace(/\D/g, "");
  return d.length ? d : null;
}

function toDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function dateOnly(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // Accept "YYYY-MM-DD" or ISO; return YYYY-MM-DD
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.,-]/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

function mapStatus(eventName: string | null, rawStatus: string | null): string {
  const e = (eventName ?? "").toLowerCase();
  const s = (rawStatus ?? "").toLowerCase();
  const bag = `${e} ${s}`;
  if (/(cancel|refus|reject)/.test(bag)) return "cancelado";
  if (/(finaliz|signed|complete|closed|sign_finished|auto_close|finish)/.test(bag)) return "assinado";
  return "aguardando_assinaturas";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let rawText = "";
  let payload: Json = {};
  try {
    rawText = await req.text();
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (_e) {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Identify tenant
  const { data: tenant } = await admin
    .from("tenants").select("id").eq("slug", TENANT_SLUG).maybeSingle();
  if (!tenant) {
    return new Response(JSON.stringify({ error: "tenant not found" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = tenant.id as string;

  // Secret validation
  const { data: secretRow } = await admin
    .from("system_settings").select("value")
    .eq("tenant_id", tenantId).eq("key", "clicksign_webhook_secret").maybeSingle();
  const expected = (secretRow?.value ?? "").trim();
  const provided = (req.headers.get("x-webhook-secret") ?? "").trim();
  if (expected) {
    if (provided !== expected) {
      return new Response(JSON.stringify({ error: "invalid secret" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    // WARNING: secret not configured — accepting webhook unauthenticated. Configure
    // clicksign_webhook_secret in system_settings before going to production.
    console.warn("[clicksign-webhook] secret not configured, accepting payload without auth");
  }

  // Extract top-level identifiers (best-effort across known Clicksign payload shapes)
  const eventName = pick<string>(payload, "event.name", "event", "name") ?? null;
  const documentKey = pick<string>(payload, "document.key", "document_key", "data.document.key", "key") ?? null;
  const rawStatus = pick<string>(payload, "document.status", "status", "data.document.status") ?? null;

  // Always store raw payload first
  const { data: eventRow, error: insErr } = await admin
    .from("clicksign_webhook_events")
    .insert({
      tenant_id: tenantId,
      event_name: eventName,
      document_key: documentKey,
      status: rawStatus,
      payload,
      processed: false,
    })
    .select("id")
    .single();

  if (insErr || !eventRow) {
    console.error("failed to log webhook event", insErr);
    return new Response(JSON.stringify({ error: "log failed", detail: insErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const eventId = eventRow.id as string;

  async function markError(message: string) {
    await admin.from("clicksign_webhook_events").update({
      processing_error: message, processed: false, processed_at: new Date().toISOString(),
    }).eq("id", eventId);
  }

  async function markOk() {
    await admin.from("clicksign_webhook_events").update({
      processed: true, processed_at: new Date().toISOString(),
    }).eq("id", eventId);
  }

  try {
    if (!documentKey) {
      await markError("document_key não encontrado no payload");
      return new Response(JSON.stringify({ ok: true, warning: "no document_key" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ----- Client extraction -----
    // Clicksign typically returns a list of signers; pick the contratante (non-buffet) signer.
    const signers = (pick<unknown[]>(payload, "document.signers", "signers", "data.signers") ?? []) as Json[];
    const formAnswers = (pick<Json>(payload, "document.form.answers", "form.answers", "answers") ?? {}) as Json;

    // helper to read a value from form answers by likely keys
    const fa = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = formAnswers[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number") return String(v);
      }
      return null;
    };

    const cpfFromForm = digits(fa("cpf", "cpf_contratante", "cpf_responsavel"));
    const cpfFromSigner = signers
      .map((s) => digits((s as Json).documentation ?? (s as Json).cpf))
      .find((v) => v && v.length === 11) ?? null;
    const cpf = cpfFromForm ?? cpfFromSigner;

    if (!cpf) {
      await markError("CPF não encontrado no payload");
      return new Response(JSON.stringify({ ok: true, warning: "no cpf" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const primarySigner = signers.find(
      (s) => digits((s as Json).documentation ?? (s as Json).cpf) === cpf,
    ) ?? signers[0] ?? {};

    const clientData = {
      tenant_id: tenantId,
      cpf,
      full_name: fa("nome_completo", "nome", "full_name", "responsavel_nome")
        ?? (primarySigner.name as string)
        ?? "Sem nome",
      email: fa("email", "email_contratante") ?? (primarySigner.email as string) ?? null,
      phone: digits(fa("telefone", "celular", "phone")) ?? digits(primarySigner.phone_number) ?? null,
      address_full: fa("endereco", "endereco_completo", "address") ?? null,
      mother_name: fa("nome_mae", "mae"),
      father_name: fa("nome_pai", "pai"),
      how_met: fa("como_conheceu", "how_met"),
    };

    // Upsert client by (tenant_id, cpf)
    let clientId: string;
    const { data: existingClient } = await admin
      .from("clients").select("id")
      .eq("tenant_id", tenantId).eq("cpf", cpf).maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
      // Update only non-null incoming fields
      const update: Json = {};
      for (const [k, v] of Object.entries(clientData)) {
        if (v !== null && v !== undefined && k !== "tenant_id" && k !== "cpf") update[k] = v;
      }
      if (Object.keys(update).length) {
        await admin.from("clients").update(update).eq("id", clientId);
      }
    } else {
      const { data: created, error: cErr } = await admin
        .from("clients").insert(clientData).select("id").single();
      if (cErr || !created) throw new Error(`client insert failed: ${cErr?.message}`);
      clientId = created.id;
    }

    // ----- Contract extraction -----
    const contractData: Json = {
      tenant_id: tenantId,
      client_id: clientId,
      clicksign_document_key: documentKey,
      clicksign_template_name: pick<string>(payload, "document.template.name", "template.name", "document.template") ?? null,
      clicksign_signed_pdf_url: pick<string>(payload, "document.downloads.signed_file_url", "document.signed_file_url", "signed_file_url") ?? null,
      status: mapStatus(eventName, rawStatus),
      event_date: dateOnly(fa("data_evento", "event_date")),
      event_start_time: fa("hora_inicio", "horario_inicio", "event_start_time"),
      event_end_time: fa("hora_fim", "horario_fim", "event_end_time"),
      guest_count: toNum(fa("numero_convidados", "convidados", "guest_count")),
      celebrant_name: fa("aniversariante", "celebrant_name"),
      celebrant_age: toNum(fa("idade_aniversariante", "celebrant_age")),
      decoration: fa("decoracao", "decoration"),
      cake: fa("bolo", "cake"),
      tasting_menu: fa("degustacao", "tasting_menu"),
      hot_dish: fa("prato_quente", "hot_dish"),
      observations: fa("observacoes", "observations"),
      children_pay_from_age: toNum(fa("idade_crianca_paga", "children_pay_from_age")),
      total_value: toNum(fa("valor_total", "total_value")),
      installment_count: toNum(fa("numero_parcelas", "installment_count")),
      payment_method: fa("forma_pagamento", "payment_method"),
      client_signed_at: toDate(pick(payload, "document.signed_at", "document.client_signed_at")),
      manager_signed_at: toDate(pick(payload, "document.manager_signed_at")),
      finalized_at: toDate(pick(payload, "document.finished_at", "document.finalized_at", "occurred_at")),
      webhook_received_at: new Date().toISOString(),
      raw_webhook_payload: payload,
    };

    // Idempotent upsert by (tenant_id, clicksign_document_key)
    let contractId: string;
    const { data: existingContract } = await admin
      .from("contracts").select("id")
      .eq("tenant_id", tenantId).eq("clicksign_document_key", documentKey).maybeSingle();

    if (existingContract) {
      contractId = existingContract.id;
      const update: Json = {};
      for (const [k, v] of Object.entries(contractData)) {
        if (v !== null && v !== undefined && k !== "tenant_id" && k !== "clicksign_document_key") update[k] = v;
      }
      if (Object.keys(update).length) {
        await admin.from("contracts").update(update).eq("id", contractId);
      }
    } else {
      const { data: created, error: ctErr } = await admin
        .from("contracts").insert(contractData).select("id").single();
      if (ctErr || !created) throw new Error(`contract insert failed: ${ctErr?.message}`);
      contractId = created.id;
    }

    // ----- Installments (optional) -----
    const installments = (pick<unknown[]>(payload, "installments", "parcelas", "document.installments") ?? []) as Json[];
    if (Array.isArray(installments) && installments.length > 0) {
      // Replace existing installments for this contract to keep idempotency clean
      await admin.from("contract_installments").delete().eq("contract_id", contractId);
      const rows = installments.map((inst, idx) => ({
        tenant_id: tenantId,
        contract_id: contractId,
        order_index: toNum(inst.order_index ?? inst.index ?? inst.ordem) ?? idx + 1,
        due_date: dateOnly(inst.due_date ?? inst.vencimento ?? inst.data_vencimento) ?? new Date().toISOString().slice(0, 10),
        amount: toNum(inst.amount ?? inst.valor) ?? 0,
        payment_method: (inst.payment_method ?? inst.forma_pagamento ?? contractData.payment_method ?? "—") as string,
        paid: false,
      }));
      const valid = rows.filter((r) => r.amount > 0);
      if (valid.length) {
        const { error: iErr } = await admin.from("contract_installments").insert(valid);
        if (iErr) console.error("installments insert failed", iErr.message);
      }
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
