// Disparo de orçamento — rota PROTEGIDA.
// Toda chamada precisa do cabeçalho x-internal-secret igual a
// QUOTE_DISPATCH_SECRET (só existe no servidor). Sem ele: 401 e nada é enviado.
// - mode "resend": vem do botão "Reenviar" (via server function) e exige
//   também o JWT de um usuário ativo do mesmo tenant da oportunidade.
// - mode "auto": uso interno servidor-a-servidor. A lead-intake-v2 chama
//   dispatchQuote() diretamente, no mesmo processo.
// Elegibilidade (formulário orcamento_automatico, sem envio com sucesso,
// reenvio só após falha) é verificada dentro de dispatchQuote().

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { dispatchQuote } from "@/lib/quote-dispatch.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const Body = z.object({
  opportunity_id: z.string().uuid(),
  mode: z.enum(["auto", "resend"]),
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/quote-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1) Segredo interno — obrigatório em toda chamada
          const expected = process.env.QUOTE_DISPATCH_SECRET;
          const given = request.headers.get("x-internal-secret") || "";
          if (!expected || !given || !safeEqual(given, expected)) {
            return json({ error: "unauthorized" }, 401);
          }

          // 2) Input
          let raw: unknown = null;
          try {
            raw = await request.json();
          } catch {
            return json({ error: "invalid_json" }, 400);
          }
          const parsed = Body.safeParse(raw);
          if (!parsed.success) return json({ error: "invalid_body" }, 400);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 3) Oportunidade precisa existir
          const { data: opp } = await supabaseAdmin
            .from("opportunities")
            .select("id, tenant_id")
            .eq("id", parsed.data.opportunity_id)
            .maybeSingle();
          if (!opp) return json({ error: "not_found" }, 404);

          // 4) Reenvio: exige usuário logado, ativo e do mesmo tenant
          if (parsed.data.mode === "resend") {
            const auth = request.headers.get("authorization") || "";
            const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
            if (!token) return json({ error: "unauthorized" }, 401);
            const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(token);
            if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);
            const { data: appUser } = await supabaseAdmin
              .from("users")
              .select("tenant_id, active")
              .eq("id", u.user.id)
              .maybeSingle();
            if (!appUser?.active || appUser.tenant_id !== opp.tenant_id) {
              return json({ error: "forbidden" }, 403);
            }
          }

          const result = await dispatchQuote(opp.id, { force: parsed.data.mode === "resend" });
          return json(result, result.ok ? 200 : 409);
        } catch (err) {
          console.error("[quote-dispatch] server_error", err);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});
