// Server function for the Marketing dashboard.
// Uses GA4 via OAuth (per-tenant connection in integrations_ga4).
// When GA4 is not connected, returns gaConfigured=false; UI shows the "Connect GA4" banner.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGa4AccessTokenForTenant } from "@/lib/ga4.functions";

type OverviewInput = {
  start: string;
  end: string;
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
  .handler(async ({ data, context }): Promise<MarketingOverview> => {
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

    // Resolve tenant from authenticated user
    const supabase = (context as any).supabase;
    const userId = (context as any).userId as string;
    const { data: u } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (!u?.tenant_id) return empty;

    let creds: { token: string; propertyId: string } | null = null;
    try {
      creds = await getGa4AccessTokenForTenant(u.tenant_id as string);
    } catch (err) {
      return { ...empty, gaConfigured: true, gaError: (err as Error).message };
    }
    if (!creds) return empty;

    try {
      const dailyRes = await runReport(creds.token, creds.propertyId, {
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

      const campRes = await runReport(creds.token, creds.propertyId, {
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
