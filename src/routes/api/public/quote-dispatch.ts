// Reenvio manual de orçamento (botão "Reenviar" do CRM).
// Está sob /api/public/ para aceitar chamadas autenticadas por JWT do app
// publicado; o handler verifica o usuário e o tenant antes de qualquer ação.
// O disparo automático dos leads novos NÃO passa por aqui — a lead-intake-v2
// chama dispatchQuote() diretamente.

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
});

export const Route = createFileRoute("/api/public/quote-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          // 1) Autenticação: JWT de usuário do app
          const auth = request.headers.get("authorization") || "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
          if (!token) return json({ error: "unauthorized" }, 401);
          const { data: userData, error: uErr } = await supabaseAdmin.auth.getUser(token);
          if (uErr || !userData?.user) return json({ error: "unauthorized" }, 401);

          // 2) Tenant do usuário
          const { data: appUser } = await supabaseAdmin
            .from("users")
            .select("id, tenant_id, active")
            .eq("id", userData.user.id)
            .maybeSingle();
          if (!appUser || !appUser.active) return json({ error: "forbidden" }, 403);

          // 3) Input
          let raw: unknown = null;
          try {
            raw = await request.json();
          } catch {
            return json({ error: "invalid_json" }, 400);
          }
          const parsed = Body.safeParse(raw);
          if (!parsed.success) return json({ error: "invalid_body" }, 400);

          // 4) A oportunidade precisa ser do mesmo tenant
          const { data: opp } = await supabaseAdmin
            .from("opportunities")
            .select("id, tenant_id")
            .eq("id", parsed.data.opportunity_id)
            .maybeSingle();
          if (!opp || opp.tenant_id !== appUser.tenant_id) {
            return json({ error: "not_found" }, 404);
          }

          // 5) Reenvio manual: força mesmo dentro da janela de 24h
          const result = await dispatchQuote(opp.id, { force: true });
          return json(result, result.ok ? 200 : 502);
        } catch (err) {
          console.error("[quote-dispatch] server_error", err);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});
