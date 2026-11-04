// Botão "Reenviar" do CRM: exige usuário logado e ativo do mesmo tenant.
// Chama a rota protegida /api/public/quote-dispatch com o segredo interno,
// que só existe no servidor.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resendQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ opportunity_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("users")
      .select("id, active")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.active) return { ok: false, detail: "forbidden" };

    // RLS garante que só vemos oportunidades do próprio tenant.
    const { data: opp } = await context.supabase
      .from("opportunities")
      .select("id")
      .eq("id", data.opportunity_id)
      .maybeSingle();
    if (!opp) return { ok: false, detail: "not_found" };

    const secret = process.env.QUOTE_DISPATCH_SECRET;
    if (!secret) return { ok: false, detail: "server_misconfigured" };
    const req = getRequest();
    const origin = new URL(req.url).origin;
    const auth = req.headers.get("authorization") ?? "";
    const res = await fetch(`${origin}/api/public/quote-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
        Authorization: auth,
      },
      body: JSON.stringify({ opportunity_id: opp.id, mode: "resend" }),
    });
    const body = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
    return { ok: res.ok, detail: body.detail ?? body.error ?? null };
  });
