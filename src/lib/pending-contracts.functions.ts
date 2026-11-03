// Contracts signed as plain PDF (no Clicksign template) arrive with
// data_pending=true. AI reads the stored PDF and saves a SUGGESTION only;
// a user confirms it to become the contract's real data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PendingSuggestion = {
  event_date?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  total_value?: number | null;
  guest_count?: number | null;
  payment_method?: string | null;
  celebrant_name?: string | null;
  source?: string | null;
  note?: string | null;
};

export const listPendingContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contracts")
      .select(
        "id, signed_file_name, client_signed_at, created_at, suggested_data, suggested_at, signed_pdf_path, event_date, event_start_time, event_end_time, total_value, guest_count, payment_method, celebrant_name, clients(full_name, email, phone)",
      )
      .eq("data_pending", true)
      .neq("status", "cancelado")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c: any) => ({
      id: c.id as string,
      file_name: c.signed_file_name as string | null,
      signed_at: (c.client_signed_at ?? c.created_at) as string,
      has_pdf: !!c.signed_pdf_path,
      suggestion: (c.suggested_data ?? {}) as PendingSuggestion,
      client: c.clients as { full_name: string; email: string | null; phone: string | null } | null,
      current: {
        event_date: c.event_date, event_start_time: c.event_start_time, event_end_time: c.event_end_time,
        total_value: c.total_value, guest_count: c.guest_count, payment_method: c.payment_method,
        celebrant_name: c.celebrant_name,
      },
    }));
  });

export const countPendingContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("data_pending", true)
      .neq("status", "cancelado");
    return { count: count ?? 0 };
  });

const suggestionSchema = z.object({
  event_date: z.string().nullable().describe("Data da festa em YYYY-MM-DD"),
  event_start_time: z.string().nullable().describe("Horário de início HH:MM"),
  event_end_time: z.string().nullable().describe("Horário de término HH:MM"),
  total_value: z.number().nullable().describe("Valor total do contrato em reais"),
  guest_count: z.number().nullable().describe("Número de convidados"),
  payment_method: z.string().nullable().describe("Forma de pagamento (PIX, Cartão, Boleto...)"),
  celebrant_name: z.string().nullable().describe("Nome do aniversariante, se houver"),
  note: z.string().nullable().describe("Observação curta se algo estiver incerto"),
});

export const suggestPendingContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS check: caller must see this contract
    const { data: ct, error } = await context.supabase
      .from("contracts")
      .select("id, tenant_id, signed_pdf_path, signed_file_name, suggested_data, clicksign_document_key")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !ct) throw new Error("Contrato não encontrado");
    const base = (ct.suggested_data ?? {}) as PendingSuggestion;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, message: "IA não configurada." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Old documents: fetch a fresh signed-PDF link from Clicksign (read-only GET) and keep a copy.
    if (!ct.signed_pdf_path) {
      const token = process.env.CLICKSIGN_ACCESS_TOKEN;
      if (!token || !ct.clicksign_document_key) {
        return { ok: false as const, message: "O PDF assinado não está guardado e a Clicksign não está conectada." };
      }
      const host = process.env.CLICKSIGN_API_HOST || "https://app.clicksign.com";
      const meta = await fetch(
        `${host}/api/v1/documents/${encodeURIComponent(ct.clicksign_document_key)}?access_token=${encodeURIComponent(token)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!meta.ok) {
        console.error("[clicksign] document fetch", meta.status, await meta.text());
        return { ok: false as const, message: `A Clicksign recusou o acesso ao documento (${meta.status}).` };
      }
      const j: any = await meta.json();
      const url = j?.document?.downloads?.signed_file_url;
      if (!url) return { ok: false as const, message: "A Clicksign não devolveu o PDF assinado." };
      const pdf = await fetch(url);
      if (!pdf.ok) return { ok: false as const, message: "Falha ao baixar o PDF da Clicksign." };
      const path = `${ct.tenant_id}/${ct.clicksign_document_key}.pdf`;
      const { error: upErr } = await supabaseAdmin.storage.from("contract-pdfs")
        .upload(path, new Uint8Array(await pdf.arrayBuffer()), { contentType: "application/pdf", upsert: true });
      if (upErr) return { ok: false as const, message: "Falha ao guardar o PDF." };
      await supabaseAdmin.from("contracts").update({ signed_pdf_path: path }).eq("id", ct.id);
      ct.signed_pdf_path = path;
    }
    const { data: file, error: dlErr } = await supabaseAdmin.storage.from("contract-pdfs").download(ct.signed_pdf_path);
    if (dlErr || !file) return { ok: false as const, message: "Não foi possível abrir o PDF." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output, NoObjectGeneratedError } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    let parsed: z.infer<typeof suggestionSchema> | null = null;
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        output: Output.object({ schema: suggestionSchema }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Este é um contrato de festa infantil assinado (arquivo "${ct.signed_file_name ?? ""}"). ` +
                  "Extraia data da festa, horários, valor total, número de convidados, forma de pagamento e aniversariante. " +
                  "Use null quando o dado não estiver no documento. Não invente.",
              },
              { type: "file", filename: ct.signed_file_name ?? "contrato.pdf", data: b64, mediaType: "application/pdf" },
            ],
          },
        ],
        providerOptions: {
          openai: {
            store: false,
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      parsed = (await result.output) as z.infer<typeof suggestionSchema>;
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) && e.text) {
        try { parsed = suggestionSchema.parse(JSON.parse(e.text)); } catch { /* ignore */ }
      }
      if (!parsed) {
        console.error("[suggestPendingContract]", e);
        return { ok: false as const, message: "A IA não conseguiu ler o PDF agora." };
      }
    }
    const merged: PendingSuggestion = { ...base };
    for (const [k, v] of Object.entries(parsed ?? {})) if (v !== null && v !== "") (merged as any)[k] = v;
    merged.source = "ia_pdf";
    await supabaseAdmin.from("contracts")
      .update({ suggested_data: merged as any, suggested_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true as const, suggestion: merged };
  });

const confirmSchema = z.object({
  id: z.string().uuid(),
  event_date: z.string().nullable(),
  event_start_time: z.string().nullable(),
  event_end_time: z.string().nullable(),
  total_value: z.number().nullable(),
  guest_count: z.number().int().nullable(),
  payment_method: z.string().nullable(),
  celebrant_name: z.string().nullable(),
});

export const confirmPendingContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const { error } = await context.supabase
      .from("contracts")
      .update({
        ...fields,
        data_pending: false,
        data_confirmed_at: new Date().toISOString(),
        data_confirmed_by: context.userId,
        manually_edited: true,
        manually_edited_at: new Date().toISOString(),
        manually_edited_by: context.userId,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
