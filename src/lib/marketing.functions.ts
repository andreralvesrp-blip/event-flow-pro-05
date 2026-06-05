// Server function for the Marketing dashboard.
// Returns GA4-derived metrics (sessions, users, form_open events) for the requested period.
// When GA4 credentials are missing, returns a disabled state and zeros — the UI will
// degrade gracefully and Supabase-sourced metrics still render.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type OverviewInput = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  source?: string;
  medium?: string;
  campaign?: string;
};

export type Ga4Daily = {
  date: string;
  sessions: number;
  users: number;
  formOpenCta: number;
  formOpenFloat: number;
};

export type Ga4Campaign = {
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  formOpens: number;
};

export type MarketingOverview = {
  gaConfigured: boolean;
  gaError: string | null;
  sessions: number;
  users: number;
  formOpens: number;
  formOpenCta: number;
  formOpenFloat: number;
  daily: Ga4Daily[];
  byCampaign: Ga4Campaign[];
};

// --- JWT (RS256) signing for Google service-account auth ----------------------
function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned =
    base64UrlEncode(JSON.stringify(header)) + "." + base64UrlEncode(JSON.stringify(claim));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + base64UrlEncode(sig);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" +
      encodeURIComponent(jwt),
  });
  if (!res.ok) throw new Error(`google_token_failed_${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function runReport(token: string, propertyId: string, body: unknown): Promise<any> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`ga4_report_failed_${res.status}_${await res.text()}`);
  return res.json();
}

export const getMarketingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: OverviewInput) => {
    if (!data?.start || !data?.end) throw new Error("missing_dates");
    return data;
  })
  .handler(async ({ data }): Promise<MarketingOverview> => {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    const empty: MarketingOverview = {
      gaConfigured: false,
      gaError: null,
      sessions: 0,
      users: 0,
      formOpens: 0,
      formOpenCta: 0,
      formOpenFloat: 0,
      daily: [],
      byCampaign: [],
    };

    if (!propertyId || !clientEmail || !privateKey) {
      return empty;
    }

    try {
      const token = await getAccessToken(clientEmail, privateKey);

      // Daily series: sessions, users, form_open_cta, form_open_float by date
      const dailyRes = await runReport(token, propertyId, {
        dateRanges: [{ startDate: data.start, endDate: data.end }],
        dimensions: [{ name: "date" }, { name: "eventName" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "eventCount" }],
        limit: 10000,
      });

      const byDate = new Map<string, Ga4Daily>();
      const ensure = (d: string): Ga4Daily => {
        const key = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        let row = byDate.get(key);
        if (!row) {
          row = { date: key, sessions: 0, users: 0, formOpenCta: 0, formOpenFloat: 0 };
          byDate.set(key, row);
        }
        return row;
      };

      let totalSessions = 0;
      let totalUsers = 0;
      let totalCta = 0;
      let totalFloat = 0;
      const sessionsByDate = new Map<string, number>();
      const usersByDate = new Map<string, number>();

      for (const r of dailyRes.rows ?? []) {
        const dateRaw = r.dimensionValues?.[0]?.value as string;
        const evt = r.dimensionValues?.[1]?.value as string;
        const sessions = Number(r.metricValues?.[0]?.value || 0);
        const users = Number(r.metricValues?.[1]?.value || 0);
        const eventCount = Number(r.metricValues?.[2]?.value || 0);
        const row = ensure(dateRaw);
        // sessions/users get aggregated across event rows for the same date — keep only the first occurrence per date
        if (!sessionsByDate.has(row.date)) {
          sessionsByDate.set(row.date, sessions);
          row.sessions = sessions;
          totalSessions += sessions;
        }
        if (!usersByDate.has(row.date)) {
          usersByDate.set(row.date, users);
          row.users = users;
          totalUsers += users;
        }
        if (evt === "form_open_cta") {
          row.formOpenCta += eventCount;
          totalCta += eventCount;
        } else if (evt === "form_open_float") {
          row.formOpenFloat += eventCount;
          totalFloat += eventCount;
        }
      }

      const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

      // By campaign: sessions + form_opens (both event variants)
      const campRes = await runReport(token, propertyId, {
        dateRanges: [{ startDate: data.start, endDate: data.end }],
        dimensions: [
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionCampaignName" },
          { name: "eventName" },
        ],
        metrics: [{ name: "sessions" }, { name: "eventCount" }],
        limit: 10000,
      });

      const campMap = new Map<string, Ga4Campaign>();
      for (const r of campRes.rows ?? []) {
        const src = (r.dimensionValues?.[0]?.value as string) || "(direct)";
        const med = (r.dimensionValues?.[1]?.value as string) || "(none)";
        const camp = (r.dimensionValues?.[2]?.value as string) || "(not set)";
        const evt = r.dimensionValues?.[3]?.value as string;
        const sessions = Number(r.metricValues?.[0]?.value || 0);
        const eventCount = Number(r.metricValues?.[1]?.value || 0);
        const key = `${src}|${med}|${camp}`;
        let row = campMap.get(key);
        if (!row) {
          row = { source: src, medium: med, campaign: camp, sessions: 0, formOpens: 0 };
          campMap.set(key, row);
        }
        // sessions repeat per event row — capture once
        if (row.sessions === 0) row.sessions = sessions;
        if (evt === "form_open_cta" || evt === "form_open_float") {
          row.formOpens += eventCount;
        }
      }

      let byCampaign = Array.from(campMap.values()).sort((a, b) => b.sessions - a.sessions);
      if (data.source) byCampaign = byCampaign.filter((r) => r.source === data.source);
      if (data.medium) byCampaign = byCampaign.filter((r) => r.medium === data.medium);
      if (data.campaign) byCampaign = byCampaign.filter((r) => r.campaign === data.campaign);

      return {
        gaConfigured: true,
        gaError: null,
        sessions: totalSessions,
        users: totalUsers,
        formOpens: totalCta + totalFloat,
        formOpenCta: totalCta,
        formOpenFloat: totalFloat,
        daily,
        byCampaign,
      };
    } catch (err) {
      console.error("GA4 error:", err);
      return { ...empty, gaConfigured: true, gaError: (err as Error).message };
    }
  });
