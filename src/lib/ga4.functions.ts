// GA4 OAuth (user-flow) server functions. Tokens never leave the server.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const REDIRECT_PATH = "/api/public/ga4-oauth/callback";

function adminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    "https://kids-point-hub.lovable.app"
  );
}

async function assertAdmin(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("tenant_id, role, tenant_role")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("forbidden");
  if (data.role !== "admin" && data.tenant_role !== "owner") {
    throw new Error("forbidden");
  }
  if (!data.tenant_id) throw new Error("no_tenant");
  return data.tenant_id as string;
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signState(payload: object): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyState(state: string): Promise<{ tenant_id: string; user_id: string; exp: number } | null> {
  try {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    if (b64url(expected) !== sig) return null;
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(body.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      ),
    );
    if (typeof json.exp !== "number" || Date.now() / 1000 > json.exp) return null;
    return json;
  } catch {
    return null;
  }
}

// --- start connect -----------------------------------------------------------
export const startGa4Connect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await assertAdmin((context as any).supabase, (context as any).userId);
    const clientId = process.env.GA4_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("ga4_oauth_not_configured");

    const state = await signState({
      tenant_id: tenantId,
      user_id: (context as any).userId,
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${appBaseUrl()}${REDIRECT_PATH}`,
      response_type: "code",
      scope: GA4_SCOPE,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  });

// --- status ------------------------------------------------------------------
export type Ga4Status = {
  connected: boolean;
  property_id: string | null;
  google_email: string | null;
  connected_at: string | null;
};

export const getGa4Status = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Ga4Status> => {
    const supabase = (context as any).supabase;
    const { data } = await supabase
      .from("integrations_ga4")
      .select("property_id, google_email, connected_at")
      .maybeSingle();
    if (!data) return { connected: false, property_id: null, google_email: null, connected_at: null };
    return {
      connected: true,
      property_id: data.property_id ?? null,
      google_email: data.google_email ?? null,
      connected_at: data.connected_at ?? null,
    };
  });

// --- disconnect --------------------------------------------------------------
export const disconnectGa4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await assertAdmin((context as any).supabase, (context as any).userId);
    const admin = adminClient();
    await admin.from("integrations_ga4").delete().eq("tenant_id", tenantId);
    return { ok: true };
  });

// --- list properties (admin api) --------------------------------------------
async function refreshAccessToken(tenantId: string): Promise<string> {
  const admin = adminClient();
  const { data: row } = await admin
    .from("integrations_ga4")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row) throw new Error("not_connected");

  const exp = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (row.access_token && Date.now() < exp - 60_000) return row.access_token as string;

  const body = new URLSearchParams({
    client_id: process.env.GA4_OAUTH_CLIENT_ID!,
    client_secret: process.env.GA4_OAUTH_CLIENT_SECRET!,
    refresh_token: row.refresh_token as string,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`refresh_failed_${res.status}_${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await admin
    .from("integrations_ga4")
    .update({ access_token: data.access_token, access_token_expires_at: expiresAt })
    .eq("tenant_id", tenantId);
  return data.access_token;
}

export const listGa4Properties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await assertAdmin((context as any).supabase, (context as any).userId);
    const token = await refreshAccessToken(tenantId);
    // List account summaries (includes properties)
    const res = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`list_properties_failed_${res.status}`);
    const data = (await res.json()) as {
      accountSummaries?: Array<{
        account: string;
        displayName: string;
        propertySummaries?: Array<{ property: string; displayName: string }>;
      }>;
    };
    const properties: Array<{ id: string; name: string; account: string }> = [];
    for (const a of data.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) {
        properties.push({
          id: p.property.replace("properties/", ""),
          name: p.displayName,
          account: a.displayName,
        });
      }
    }
    return { properties };
  });

export const setGa4Property = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { property_id: string }) => {
    if (!d?.property_id || !/^\d+$/.test(d.property_id)) throw new Error("invalid_property_id");
    return d;
  })
  .handler(async ({ data, context }) => {
    const tenantId = await assertAdmin((context as any).supabase, (context as any).userId);
    const admin = adminClient();
    await admin
      .from("integrations_ga4")
      .update({ property_id: data.property_id })
      .eq("tenant_id", tenantId);
    return { ok: true };
  });

// Exposed for the marketing.functions.ts rewrite
export async function getGa4AccessTokenForTenant(tenantId: string): Promise<{
  token: string;
  propertyId: string;
} | null> {
  const admin = adminClient();
  const { data: row } = await admin
    .from("integrations_ga4")
    .select("property_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row?.property_id) return null;
  const token = await refreshAccessToken(tenantId);
  return { token, propertyId: row.property_id as string };
}
