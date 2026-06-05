// GA4 OAuth callback. Exchanges `code` for refresh_token and stores it server-side.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyState } from "@/lib/ga4.functions";

const REDIRECT_PATH = "/api/public/ga4-oauth/callback";

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    "https://kids-point-hub.lovable.app"
  );
}

function backTo(qs: string) {
  return Response.redirect(`${appBaseUrl()}/configuracoes?${qs}`, 302);
}

export const Route = createFileRoute("/api/public/ga4-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        if (err) return backTo(`ga4=error&reason=${encodeURIComponent(err)}`);
        if (!code || !state) return backTo("ga4=error&reason=missing_params");

        const parsed = await verifyState(state);
        if (!parsed) return backTo("ga4=error&reason=invalid_state");

        const clientId = process.env.GA4_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return backTo("ga4=error&reason=oauth_not_configured");
        }

        // Exchange code for tokens
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${appBaseUrl()}${REDIRECT_PATH}`,
          grant_type: "authorization_code",
        });
        const tokRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!tokRes.ok) {
          const t = await tokRes.text();
          console.error("[ga4-oauth] token exchange failed", tokRes.status, t);
          return backTo(`ga4=error&reason=token_exchange_${tokRes.status}`);
        }
        const tok = (await tokRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope?: string;
        };
        if (!tok.refresh_token) {
          return backTo("ga4=error&reason=no_refresh_token");
        }

        // Fetch userinfo (email) for display
        let email: string | null = null;
        try {
          const u = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tok.access_token}` },
          });
          if (u.ok) email = ((await u.json()) as { email?: string }).email ?? null;
        } catch {}

        const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
        const { error } = await supabaseAdmin
          .from("integrations_ga4")
          .upsert({
            tenant_id: parsed.tenant_id,
            refresh_token: tok.refresh_token,
            access_token: tok.access_token,
            access_token_expires_at: expiresAt,
            google_email: email,
            scope: tok.scope ?? null,
            connected_by_user_id: parsed.user_id,
            connected_at: new Date().toISOString(),
          });
        if (error) {
          console.error("[ga4-oauth] upsert failed", error);
          return backTo(`ga4=error&reason=db_${encodeURIComponent(error.message)}`);
        }

        return backTo("ga4=connected");
      },
    },
  },
});
