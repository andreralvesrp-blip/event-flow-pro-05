// Server-only: disparo de orçamento (e-mail via Resend + passo de WhatsApp).
// Chamado pela rota pública lead-intake-v2 (após salvar o lead) e pela rota
// quote-dispatch (botão "Reenviar" do CRM, com JWT de usuário).
// Nunca importar em código de cliente.
import { CHATGURU_FORM, sendChatguruWebhook } from "./chatguru-webhook.server";

export type DispatchResult = {
  ok: boolean;
  deduped?: boolean;
  email_status: "pendente" | "enviado" | "falhou" | "sem_email" | "dedupado";
  whatsapp_status: "pendente" | "desligado" | "enviado" | "falhou" | "nao_reenviado";
  detail?: string;
};

function formatBR(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function dispatchQuote(
  opportunityId: string,
  opts: { force?: boolean; baseUrl?: string } = {},
): Promise<DispatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // --- Carrega oportunidade, cliente e config do formulário ---
  const { data: opp, error: oErr } = await supabaseAdmin
    .from("opportunities")
    .select("id, tenant_id, unit_id, client_id, desired_date, email, form_slug, created_at")
    .eq("id", opportunityId)
    .maybeSingle();
  if (oErr || !opp) {
    return { ok: false, email_status: "falhou", whatsapp_status: "desligado", detail: "opportunity_not_found" };
  }

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, phone, phone_normalized, email")
    .eq("id", opp.client_id)
    .maybeSingle();

  const { data: form } = await supabaseAdmin
    .from("forms")
    .select(
      "id, flow_version, whatsapp_enabled, quote_unit_name, quote_unit_address, quote_unit_phone, quote_whatsapp_number, chatguru_dialog_id",
    )
    .eq("slug", opp.form_slug ?? "")
    .maybeSingle();

  // --- Elegibilidade (verificada no servidor em todo disparo) ---
  if (!form || form.flow_version !== "orcamento_automatico") {
    return { ok: false, email_status: "falhou", whatsapp_status: "desligado", detail: "form_not_orcamento_automatico" };
  }
  const { data: prevEmail } = await supabaseAdmin
    .from("quote_sends")
    .select("status, created_at")
    .eq("opportunity_id", opp.id)
    .eq("channel", "email")
    .order("created_at", { ascending: false });
  const prev = prevEmail ?? [];
  const { data: prevWaRows } = await supabaseAdmin
    .from("quote_sends")
    .select("status, created_at")
    .eq("opportunity_id", opp.id)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false });
  const prevWa = prevWaRows ?? [];
  // Webhook do ChatGuru: somente bs-orcamento-teste com WhatsApp ativo.
  const waEnabled = form.whatsapp_enabled === true && opp.form_slug === CHATGURU_FORM;
  const failed = (s?: { status: string }) => !!s && ["falhou", "bloqueado_limite"].includes(s.status);
  let doEmail: boolean;
  let doWa: boolean;
  if (opts.force) {
    // Reenviar só vale para o canal cujo último envio falhou ou foi bloqueado pelo limite.
    doEmail = failed(prev[0]) && !prev.some((s) => s.status === "enviado");
    doWa = waEnabled && !prevWa.some((s) => s.status === "enviado") && (prevWa.length === 0 ? failed(prev[0]) : failed(prevWa[0]));
    if (!doEmail && !doWa) {
      return { ok: false, email_status: "falhou", whatsapp_status: "desligado", detail: "resend_only_after_failure" };
    }
  } else {
    if (prev.some((s) => s.status === "enviado")) {
      return { ok: false, email_status: "falhou", whatsapp_status: "desligado", detail: "already_sent" };
    }
    if (prev.length) {
      // Disparo automático acontece uma única vez por oportunidade.
      return { ok: false, email_status: "falhou", whatsapp_status: "desligado", detail: "already_dispatched" };
    }
    doEmail = true;
    doWa = waEnabled;
  }

  // O e-mail informado no formulário (opportunities.email) tem sempre prioridade.
  const recipientEmail = opp.email || client?.email || null;
  const nome = firstName(client?.full_name);
  const dateBR = formatBR(opp.desired_date);

  // --- Dedupe: mesmo telefone + mesma data em 24h não dispara de novo ---
  if (!opts.force && client?.phone_normalized && opp.desired_date) {
    const since = new Date(new Date(opp.created_at).getTime() - 24 * 3600 * 1000).toISOString();
    const { data: samePhoneClients } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("tenant_id", opp.tenant_id)
      .eq("phone_normalized", client.phone_normalized);
    const clientIds = (samePhoneClients ?? []).map((c) => c.id);
    if (clientIds.length) {
      const { data: siblingOpps } = await supabaseAdmin
        .from("opportunities")
        .select("id")
        .in("client_id", clientIds)
        .eq("desired_date", opp.desired_date)
        .neq("id", opp.id)
        .gte("created_at", since)
        .lte("created_at", opp.created_at);
      const sibIds = (siblingOpps ?? []).map((o) => o.id);
      if (sibIds.length) {
        const { data: priorSends } = await supabaseAdmin
          .from("quote_sends")
          .select("id")
          .in("opportunity_id", sibIds)
          .eq("channel", "email")
          .in("status", ["enviado", "pendente"]);
        if (priorSends && priorSends.length > 0) {
          return { ok: true, deduped: true, email_status: "dedupado", whatsapp_status: "desligado" };
        }
      }
    }
  }

  // --- Webhook ChatGuru: em paralelo ao e-mail, uma única tentativa ---
  const baseUrl = (opts.baseUrl || process.env.PUBLIC_APP_URL || "https://kids-point-hub.lovable.app").replace(/\/$/, "");
  const waPromise = doWa
    ? sendChatguruWebhook(opp.id, baseUrl).catch((e) => { console.error("[dispatch] chatguru", e); return "falhou" as const; })
    : null;

  // --- E-mail (Resend) ---
  const resendKey = process.env.RESEND_API_KEY;
  let emailStatus: DispatchResult["email_status"] = "pendente";
  let emailDetail: string | null = null;

  if (!doEmail) {
    emailStatus = "dedupado";
  } else if (!recipientEmail) {
    emailStatus = "sem_email";
  } else if (!resendKey) {
    emailStatus = "falhou";
    emailDetail = "RESEND_API_KEY não configurado";
  } else {
    const base = (process.env.PUBLIC_APP_URL || "https://kids-point-hub.lovable.app").replace(/\/$/, "");
    const unitName = form?.quote_unit_name || "Kids Point";
    const unitAddress = form?.quote_unit_address || "";
    const unitPhone = form?.quote_unit_phone || "";
    const waNumber = (form?.quote_whatsapp_number || "").replace(/\D/g, "");

    // Anexo: PDF público do orçamento
    let attachment: { filename: string; content: string } | null = null;
    try {
      const pdfRes = await fetch(`${base}/orcamento-kidspoint.pdf`);
      if (pdfRes.ok) {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        attachment = { filename: "orcamento-kidspoint.pdf", content: buf.toString("base64") };
      } else {
        emailDetail = `pdf_fetch_http_${pdfRes.status}`;
      }
    } catch (e) {
      emailDetail = `pdf_fetch_error: ${(e as Error).message}`;
    }

    const waText = encodeURIComponent(
      `Olá! Sou ${nome} e quero verificar a disponibilidade do dia ${dateBR} na Kids Point.`,
    );
    const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${waText}` : "#";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px;">
    <p style="font-size:16px;line-height:1.6;">Oi, ${escapeHtml(nome)}! Tudo bem?</p>
    <p style="font-size:16px;line-height:1.6;">Recebemos seu pedido de orçamento para a festa de <strong>${escapeHtml(dateBR)}</strong>. Nosso cardápio e os valores estão no PDF anexo.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${waUrl}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:12px;">Verificar disponibilidade de data</a>
    </p>
    <p style="font-size:16px;line-height:1.6;">Qualquer dúvida, é só responder este e-mail ou chamar a gente no WhatsApp.</p>
    <p style="font-size:16px;line-height:1.6;margin-top:28px;">
      Andreia<br/>
      <strong>Kids Point ${escapeHtml(unitName)}</strong><br/>
      <span style="color:#64748B;font-size:14px;">${escapeHtml(unitAddress)}${unitAddress && unitPhone ? " | " : ""}${escapeHtml(unitPhone)}</span>
    </p>
  </div>
</body>
</html>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Andreia | Kids Point ${unitName} <andreia@kidspoint.com.br>`,
          to: [recipientEmail],
          subject: `${nome}, seu orçamento Kids Point`,
          html,
          attachments: attachment ? [attachment] : undefined,
        }),
      });
      if (res.ok) {
        emailStatus = "enviado";
      } else {
        emailStatus = "falhou";
        emailDetail = `resend_http_${res.status}: ${(await res.text()).slice(0, 1500)}`;
      }
    } catch (e) {
      emailStatus = "falhou";
      emailDetail = `resend_error: ${(e as Error).message}`;
    }
  }

  if (doEmail) await supabaseAdmin.from("quote_sends").insert({
    tenant_id: opp.tenant_id,
    opportunity_id: opp.id,
    channel: "email",
    status: emailStatus,
    recipient: recipientEmail,
    provider_response: emailDetail,
    sent_at: emailStatus === "enviado" ? new Date().toISOString() : null,
  } as never);

  // --- WhatsApp ---
  let waStatus: DispatchResult["whatsapp_status"] = "desligado";
  if (waPromise) {
    waStatus = await waPromise;
  } else if (!opts.force) {
    await supabaseAdmin.from("quote_sends").insert({
      tenant_id: opp.tenant_id,
      opportunity_id: opp.id,
      channel: "whatsapp",
      status: "desligado",
      recipient: client?.phone_normalized ?? null,
      provider_response: null,
    } as never);
  } else {
    waStatus = "nao_reenviado";
  }

  return {
    ok: doEmail ? emailStatus === "enviado" || emailStatus === "sem_email" : waStatus === "enviado",
    email_status: emailStatus,
    whatsapp_status: waStatus,
    detail: emailDetail ?? undefined,
  };
}
