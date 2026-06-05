import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/browser-client";
import { useUnit } from "@/contexts/UnitContext";
import { useAuth } from "@/hooks/useAuth";
import {
  getMarketingOverview,
  type MarketingOverview,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/marketing")({
  component: MarketingPage,
});

// --- helpers -----------------------------------------------------------------
type RangeKey = "7d" | "30d" | "this_month" | "last_month";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFor(key: RangeKey): { start: string; end: string; prevStart: string; prevEnd: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start = new Date(today);
  let end = new Date(today);
  if (key === "7d") {
    start.setDate(today.getDate() - 6);
  } else if (key === "30d") {
    start.setDate(today.getDate() - 29);
  } else if (key === "this_month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (key === "last_month") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  return {
    start: toISODate(start),
    end: toISODate(end),
    prevStart: toISODate(prevStart),
    prevEnd: toISODate(prevEnd),
  };
}

const fmtInt = (v: number) => v.toLocaleString("pt-BR");
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

type SbAgg = {
  leadsCreated: number;
  visitsScheduled: number;
  visitsCompleted: number;
  visitNoShows: number;
  preReserves: number;
  wonContracts: number;
  soldRevenue: number;
  dailyLeads: Map<string, number>;
  dailyVisitsScheduled: Map<string, number>;
  dailyVisitsCompleted: Map<string, number>;
  dailyContracts: Map<string, number>;
  byCampaign: Map<
    string,
    {
      source: string;
      medium: string;
      campaign: string;
      leadsCreated: number;
      visitsScheduled: number;
      visitsCompleted: number;
      preReserves: number;
      wonContracts: number;
      soldRevenue: number;
    }
  >;
};

function emptyAgg(): SbAgg {
  return {
    leadsCreated: 0,
    visitsScheduled: 0,
    visitsCompleted: 0,
    visitNoShows: 0,
    preReserves: 0,
    wonContracts: 0,
    soldRevenue: 0,
    dailyLeads: new Map(),
    dailyVisitsScheduled: new Map(),
    dailyVisitsCompleted: new Map(),
    dailyContracts: new Map(),
    byCampaign: new Map(),
  };
}

function incDaily(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function MarketingPage() {
  const { unitFilter } = useUnit();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.tenant_role === "owner";
  const [range, setRange] = useState<RangeKey>("30d");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [mediumFilter, setMediumFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<SbAgg>(emptyAgg());
  const [ga, setGa] = useState<MarketingOverview | null>(null);
  const [firstParty, setFirstParty] = useState<{
    pageviews: number;
    sessions: number;
    users: number;
    formOpens: number;
    formOpenCta: number;
    formOpenFloat: number;
    daily: { date: string; pageviews: number; sessions: number; formOpenCta: number; formOpenFloat: number }[];
    byCampaign: { source: string; medium: string; campaign: string; pageviews: number; sessions: number; users: number; formOpens: number }[];
  } | null>(null);
  type MevRow = {
    created_at: string;
    event_name: string;
    form_slug: string | null;
    tenant_id: string | null;
    unit_id: string | null;
    session_id: string | null;
    visitor_id: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
  };
  const [mevDebug, setMevDebug] = useState<{
    total: number;
    byEvent: Record<string, number>;
    rows: MevRow[];
    error: string | null;
    period: { start: string; end: string };
  } | null>(null);

  const fetchOverview = useServerFn(getMarketingOverview);


  const r = useMemo(() => rangeFor(range), [range]);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);

      // ----- Supabase queries (período = data do evento) -----
      // 1) Leads (opps criadas no período) -> attribution from opp.utm
      let oppQ = supabase
        .from("opportunities")
        .select("id, created_at, utm_source, utm_medium, utm_campaign")
        .gte("created_at", `${r.start}T00:00:00`)
        .lte("created_at", `${r.end}T23:59:59`);
      if (unitFilter) oppQ = oppQ.eq("unit_id", unitFilter);

      // 2) Visitas com created_at no período -> attribution via opportunity_id
      let visitsQ = supabase
        .from("visits")
        .select("id, opportunity_id, scheduled_at, status, created_at")
        .gte("created_at", `${r.start}T00:00:00`)
        .lte("created_at", `${r.end}T23:59:59`);
      if (unitFilter) visitsQ = visitsQ.eq("unit_id", unitFilter);

      // 3) Contratos assinados (finalized_at no período)
      let contractsQ = supabase
        .from("contracts")
        .select("id, status, total_value, finalized_at, opportunity_id")
        .eq("status", "assinado")
        .gte("finalized_at", `${r.start}T00:00:00`)
        .lte("finalized_at", `${r.end}T23:59:59`);
      if (unitFilter) contractsQ = contractsQ.eq("unit_id", unitFilter);

      // 4) Pré-reservas (pre_reserva_at no período)
      let preQ = supabase
        .from("opportunities")
        .select("id, utm_source, utm_medium, utm_campaign")
        .not("pre_reserva_at", "is", null)
        .gte("pre_reserva_at", `${r.start}T00:00:00`)
        .lte("pre_reserva_at", `${r.end}T23:59:59`);
      if (unitFilter) preQ = preQ.eq("unit_id", unitFilter);

      const [
        { data: opps },
        { data: visits },
        { data: contracts },
        { data: preList },
      ] = await Promise.all([oppQ, visitsQ, contractsQ, preQ]);

      if (cancel) return;

      // Map opp_id -> utm. Buscar opps referenciadas que não estão no cohort.
      type OppUtm = { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null };
      const oppById = new Map<string, OppUtm>();
      for (const o of opps ?? []) oppById.set(o.id, o);

      const missingOppIds = new Set<string>();
      for (const v of visits ?? []) {
        if (v.opportunity_id && !oppById.has(v.opportunity_id)) missingOppIds.add(v.opportunity_id);
      }
      for (const c of contracts ?? []) {
        if (c.opportunity_id && !oppById.has(c.opportunity_id)) missingOppIds.add(c.opportunity_id);
      }
      if (missingOppIds.size > 0) {
        const { data: extra } = await supabase
          .from("opportunities")
          .select("id, utm_source, utm_medium, utm_campaign")
          .in("id", Array.from(missingOppIds));
        for (const o of extra ?? []) oppById.set(o.id, o);
      }

      const NORM = (v: string | null | undefined, fallback: string) =>
        v && v.trim() !== "" ? v : fallback;
      const attrFor = (o?: OppUtm | null) => ({
        source: NORM(o?.utm_source, "(direct)"),
        medium: NORM(o?.utm_medium, "(none)"),
        campaign: NORM(o?.utm_campaign, "(not set)"),
      });

      const a = emptyAgg();
      const ensureCamp = (s: string, m: string, c: string) => {
        const key = `${s}|${m}|${c}`;
        let row = a.byCampaign.get(key);
        if (!row) {
          row = {
            source: s, medium: m, campaign: c,
            leadsCreated: 0, visitsScheduled: 0, visitsCompleted: 0,
            preReserves: 0, wonContracts: 0, soldRevenue: 0,
          };
          a.byCampaign.set(key, row);
        }
        return row;
      };

      // Leads
      for (const o of opps ?? []) {
        const { source, medium, campaign } = attrFor(o);
        ensureCamp(source, medium, campaign).leadsCreated++;
        incDaily(a.dailyLeads, (o.created_at as string).slice(0, 10));
      }

      // Visitas
      for (const v of visits ?? []) {
        const opp = v.opportunity_id ? oppById.get(v.opportunity_id) : null;
        const { source, medium, campaign } = attrFor(opp);
        const row = ensureCamp(source, medium, campaign);
        const d = (v.scheduled_at as string | null)?.slice(0, 10) ?? (v.created_at as string).slice(0, 10);
        if (v.status === "agendada" || v.status === "realizada" || v.status === "remarcada") {
          row.visitsScheduled++;
          incDaily(a.dailyVisitsScheduled, d);
        }
        if (v.status === "realizada") {
          row.visitsCompleted++;
          incDaily(a.dailyVisitsCompleted, d);
        }
        if (v.status === "no_show") {
          a.visitNoShows++;
        }
      }

      // Pré-reservas
      for (const o of preList ?? []) {
        const { source, medium, campaign } = attrFor(o);
        ensureCamp(source, medium, campaign).preReserves++;
      }

      // Contratos ganhos
      for (const c of contracts ?? []) {
        const opp = c.opportunity_id ? oppById.get(c.opportunity_id) : null;
        const { source, medium, campaign } = attrFor(opp);
        const row = ensureCamp(source, medium, campaign);
        row.wonContracts++;
        row.soldRevenue += Number(c.total_value || 0);
        if (c.finalized_at) {
          incDaily(a.dailyContracts, (c.finalized_at as string).slice(0, 10));
        }
      }

      // KPIs = soma da tabela por origem/campanha (consistência garantida)
      let leadsTotal = 0, vAg = 0, vReal = 0, pre = 0, won = 0, rev = 0;
      for (const row of a.byCampaign.values()) {
        leadsTotal += row.leadsCreated;
        vAg += row.visitsScheduled;
        vReal += row.visitsCompleted;
        pre += row.preReserves;
        won += row.wonContracts;
        rev += row.soldRevenue;
      }
      a.leadsCreated = leadsTotal;
      a.visitsScheduled = vAg;
      a.visitsCompleted = vReal;
      a.preReserves = pre;
      a.wonContracts = won;
      a.soldRevenue = rev;

      // Dev-time consistency check
      if (import.meta.env.DEV) {
        const rows = Array.from(a.byCampaign.values());
        const sum = (k: "leadsCreated" | "visitsScheduled" | "visitsCompleted" | "wonContracts" | "soldRevenue") =>
          rows.reduce((acc, row) => acc + row[k], 0);
        const checks: Array<[string, number, number]> = [
          ["leadsCreated", sum("leadsCreated"), a.leadsCreated],
          ["visitsScheduled", sum("visitsScheduled"), a.visitsScheduled],
          ["visitsCompleted", sum("visitsCompleted"), a.visitsCompleted],
          ["wonContracts", sum("wonContracts"), a.wonContracts],
          ["soldRevenue", sum("soldRevenue"), a.soldRevenue],
        ];
        for (const [name, s, k] of checks) {
          if (s !== k) console.warn(`[marketing] inconsistência ${name}: sum(byCampaign)=${s} kpi=${k}`);
        }
      }

      setAgg(a);

      // ----- GA4 via server fn -----
      try {
        const ov = await fetchOverview({
          data: {
            start: r.start,
            end: r.end,
            source: sourceFilter !== "all" ? sourceFilter : undefined,
            medium: mediumFilter !== "all" ? mediumFilter : undefined,
            campaign: campaignFilter !== "all" ? campaignFilter : undefined,
          },
        });
        if (!cancel) setGa(ov);
      } catch (e) {
        if (!cancel)
          setGa({
            gaConfigured: false,
            gaError: (e as Error).message,
            sessions: 0,
            users: 0,
            formOpens: 0,
            formOpenCta: 0,
            formOpenFloat: 0,
            daily: [],
            byCampaign: [],
          });
      }

      // ----- First-party marketing_events (fallback / sempre p/ form opens) -----
      try {
        // Use BRT end-of-day to avoid losing same-day events
        const startIso = `${r.start}T00:00:00-03:00`;
        const endIso = `${r.end}T23:59:59.999-03:00`;
        let mevQ = supabase
          .from("marketing_events")
          .select("event_name, session_id, created_at, utm_source, utm_medium, utm_campaign, form_slug, tenant_id, unit_id")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false })
          .limit(50000);
        if (unitFilter) mevQ = mevQ.eq("unit_id", unitFilter);
        const { data: mev, error: mevErr } = await mevQ;
        if (cancel) return;

        const byEventCount: Record<string, number> = {};
        for (const e of mev ?? []) byEventCount[e.event_name] = (byEventCount[e.event_name] ?? 0) + 1;
        if (!cancel) {
          setMevDebug({
            total: (mev ?? []).length,
            byEvent: byEventCount,
            rows: (mev ?? []).slice(0, 20) as MevRow[],
            error: mevErr?.message ?? null,
            period: { start: startIso, end: endIso },
          });
        }
        if (import.meta.env.DEV) {
          console.info("[marketing] marketing_events debug", {
            period: { start: startIso, end: endIso },
            unitFilter,
            error: mevErr?.message ?? null,
            total: (mev ?? []).length,
            byEvent: byEventCount,
            last20: (mev ?? []).slice(0, 20),
          });
        }

        const sessSet = new Set<string>();
        const dailyMap = new Map<
          string,
          { date: string; sessions: number; formOpenCta: number; formOpenFloat: number; _sess: Set<string> }
        >();
        const campMap = new Map<
          string,
          { source: string; medium: string; campaign: string; sessions: number; formOpens: number; _sess: Set<string> }
        >();
        let openCta = 0, openFloat = 0;

        const ensureDay = (d: string) => {
          let row = dailyMap.get(d);
          if (!row) {
            row = { date: d, sessions: 0, formOpenCta: 0, formOpenFloat: 0, _sess: new Set() };
            dailyMap.set(d, row);
          }
          return row;
        };
        const ensureCamp = (s: string, m: string, c: string) => {
          const k = `${s}|${m}|${c}`;
          let row = campMap.get(k);
          if (!row) {
            row = { source: s, medium: m, campaign: c, sessions: 0, formOpens: 0, _sess: new Set() };
            campMap.set(k, row);
          }
          return row;
        };

        for (const e of mev ?? []) {
          const date = (e.created_at as string).slice(0, 10);
          const drow = ensureDay(date);
          const src = e.utm_source || "(direct)";
          const med = e.utm_medium || "(none)";
          const camp = e.utm_campaign || "(not set)";
          const crow = ensureCamp(src, med, camp);
          const sk = e.session_id || `_${e.created_at}`;

          if (e.event_name === "site_session") {
            sessSet.add(sk);
            if (!drow._sess.has(sk)) { drow._sess.add(sk); drow.sessions++; }
            if (!crow._sess.has(sk)) { crow._sess.add(sk); crow.sessions++; }
          } else if (e.event_name === "form_open_cta") {
            openCta++;
            drow.formOpenCta++;
            crow.formOpens++;
          } else if (e.event_name === "form_open_float") {
            openFloat++;
            drow.formOpenFloat++;
            crow.formOpens++;
          }
        }

        const daily = Array.from(dailyMap.values())
          .map((d) => ({ date: d.date, sessions: d.sessions, formOpenCta: d.formOpenCta, formOpenFloat: d.formOpenFloat }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const byCampaign = Array.from(campMap.values()).map((c) => ({
          source: c.source, medium: c.medium, campaign: c.campaign,
          sessions: c.sessions, formOpens: c.formOpens,
        }));

        if (!cancel) {
          setFirstParty({
            sessions: sessSet.size,
            users: sessSet.size,
            formOpens: openCta + openFloat,
            formOpenCta: openCta,
            formOpenFloat: openFloat,
            daily,
            byCampaign,
          });
        }
      } catch (e) {
        if (!cancel) setFirstParty(null);
      }

      setLoading(false);
    }
    load();
    return () => {
      cancel = true;
    };
  }, [r.start, r.end, unitFilter, sourceFilter, mediumFilter, campaignFilter, fetchOverview]);


  // Derived — usa GA4 quando configurado E com dados; senão fallback first-party (marketing_events)
  const gaHasData = !!ga?.gaConfigured && (ga?.sessions ?? 0) > 0;
  const useGa = gaHasData;
  const siteSource = useGa ? ga : firstParty;
  const sessions = siteSource?.sessions ?? 0;
  const users = siteSource?.users ?? 0;
  const formOpens = siteSource?.formOpens ?? 0;
  const formOpenCtaTotal = siteSource?.formOpenCta ?? 0;
  const formOpenFloatTotal = siteSource?.formOpenFloat ?? 0;

  const leadConvRate = formOpens > 0 ? agg.leadsCreated / formOpens : 0;
  const visitSchedRate = agg.leadsCreated > 0 ? agg.visitsScheduled / agg.leadsCreated : 0;
  const visitShowRate = agg.visitsScheduled > 0 ? agg.visitsCompleted / agg.visitsScheduled : 0;
  const closeRate = agg.visitsCompleted > 0 ? agg.wonContracts / agg.visitsCompleted : 0;
  const siteToVisit = sessions > 0 ? agg.visitsCompleted / sessions : 0;
  const siteToSale = sessions > 0 ? agg.wonContracts / sessions : 0;
  const formOpenRate = sessions > 0 ? formOpens / sessions : 0;


  // Build daily series
  const dailyMap = new Map<
    string,
    {
      date: string;
      sessions: number;
      formOpens: number;
      leads: number;
      visitsAgendadas: number;
      visitsRealizadas: number;
      contratos: number;
    }
  >();
  function ensureDay(d: string) {
    let row = dailyMap.get(d);
    if (!row) {
      row = {
        date: d,
        sessions: 0,
        formOpens: 0,
        leads: 0,
        visitsAgendadas: 0,
        visitsRealizadas: 0,
        contratos: 0,
      };
      dailyMap.set(d, row);
    }
    return row;
  }
  (siteSource?.daily ?? []).forEach((g) => {
    const row = ensureDay(g.date);
    row.sessions = g.sessions;
    row.formOpens = g.formOpenCta + g.formOpenFloat;
  });
  agg.dailyLeads.forEach((v, k) => (ensureDay(k).leads = v));
  agg.dailyVisitsScheduled.forEach((v, k) => (ensureDay(k).visitsAgendadas = v));
  agg.dailyVisitsCompleted.forEach((v, k) => (ensureDay(k).visitsRealizadas = v));
  agg.dailyContracts.forEach((v, k) => (ensureDay(k).contratos = v));
  const dailySeries = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Merge campaign tables (site sessions/formOpens + Supabase conversions)
  const campTable = new Map<
    string,
    {
      source: string;
      medium: string;
      campaign: string;
      sessions: number;
      formOpens: number;
      leadsCreated: number;
      visitsScheduled: number;
      visitsCompleted: number;
      preReserves: number;
      wonContracts: number;
      soldRevenue: number;
    }
  >();
  function getCamp(s: string, m: string, c: string) {
    const k = `${s}|${m}|${c}`;
    let row = campTable.get(k);
    if (!row) {
      row = {
        source: s,
        medium: m,
        campaign: c,
        sessions: 0,
        formOpens: 0,
        leadsCreated: 0,
        visitsScheduled: 0,
        visitsCompleted: 0,
        preReserves: 0,
        wonContracts: 0,
        soldRevenue: 0,
      };
      campTable.set(k, row);
    }
    return row;
  }
  (siteSource?.byCampaign ?? []).forEach((g) => {
    const r = getCamp(g.source, g.medium, g.campaign);
    r.sessions = g.sessions;
    r.formOpens = g.formOpens;
  });

  agg.byCampaign.forEach((g) => {
    const r = getCamp(g.source, g.medium, g.campaign);
    r.leadsCreated = g.leadsCreated;
    r.visitsScheduled = g.visitsScheduled;
    r.visitsCompleted = g.visitsCompleted;
    r.preReserves = g.preReserves;
    r.wonContracts = g.wonContracts;
    r.soldRevenue = g.soldRevenue;
  });
  const campRows = Array.from(campTable.values()).sort(
    (a, b) => b.sessions + b.leadsCreated - (a.sessions + a.leadsCreated),
  );

  const sourceOptions = Array.from(new Set(campRows.map((c) => c.source))).sort();
  const mediumOptions = Array.from(new Set(campRows.map((c) => c.medium))).sort();
  const campaignOptions = Array.from(new Set(campRows.map((c) => c.campaign))).sort();

  const funnelStages = [
    { label: "Sessões", value: sessions, color: "#94a3b8" },
    { label: "Aberturas do form", value: formOpens, color: "#60a5fa" },
    { label: "Leads", value: agg.leadsCreated, color: "#3b82f6" },
    { label: "Visitas agendadas", value: agg.visitsScheduled, color: "#a855f7" },
    { label: "Visitas realizadas", value: agg.visitsCompleted, color: "#10b981", highlight: true },
    { label: "Pré-reservas", value: agg.preReserves, color: "#f97316" },
    { label: "Contratos ganhos", value: agg.wonContracts, color: "#059669" },
  ];
  const funnelMax = Math.max(1, ...funnelStages.map((s) => s.value));

  return (
    <AppLayout title="Marketing">
      <div className="space-y-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label className="text-xs text-slate-500">Período</label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="this_month">Mês atual</SelectItem>
                <SelectItem value="last_month">Mês anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-slate-500">Origem (source)</label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {sourceOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-slate-500">Meio (medium)</label>
            <Select value={mediumFilter} onValueChange={setMediumFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {mediumOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-slate-500">Campanha</label>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {campaignOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-slate-500 text-right">
            {r.start} → {r.end}
            <div className="text-[10px] text-slate-400 max-w-[280px]">
              Cada métrica é contada pela data do evento no período
              (lead = criação, visita = registro, contrato = assinatura).
              Atribuição UTM herdada da oportunidade; sem UTM → (direct)/(none)/(not set).
            </div>
          </div>
        </div>

        {/* GA4 status banner */}
        {ga && !ga.gaConfigured && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-sm text-blue-900">
              <strong>Modo first-party ativo.</strong> GA4 não está configurado — sessões e aberturas do formulário vêm da tabela <code>marketing_events</code>, alimentada pelo widget do site. Para complementar com dados de GA4 (incluindo sessões orgânicas e usuários únicos), adicione os secrets <code>GA4_PROPERTY_ID</code>, <code>GOOGLE_CLIENT_EMAIL</code> e <code>GOOGLE_PRIVATE_KEY</code>.

            </CardContent>
          </Card>
        )}
        {ga?.gaError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-900">
              Erro ao consultar GA4: <code>{ga.gaError}</code>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <Kpi label="Usuários do site" value={fmtInt(users)} loading={loading} />
          <Kpi label="Sessões" value={fmtInt(sessions)} loading={loading} />
          <Kpi label="Aberturas do form" value={fmtInt(formOpens)} sub={`CTA ${fmtInt(formOpenCtaTotal)} · Float ${fmtInt(formOpenFloatTotal)}`} loading={loading} />
          <Kpi label="Leads criados" value={fmtInt(agg.leadsCreated)} loading={loading} />
          <Kpi label="Visitas agendadas" value={fmtInt(agg.visitsScheduled)} loading={loading} />
          <Kpi
            label="Visitas realizadas"
            value={fmtInt(agg.visitsCompleted)}
            highlight
            sub={`${agg.visitNoShows} no-show`}
            loading={loading}
          />
          <Kpi label="Pré-reservas" value={fmtInt(agg.preReserves)} loading={loading} />
          <Kpi label="Contratos ganhos" value={fmtInt(agg.wonContracts)} loading={loading} />
          <Kpi label="Receita vendida" value={fmtBRL(agg.soldRevenue)} loading={loading} />
          <Kpi label="Lead → Visita ag." value={fmtPct(agg.visitsScheduled, agg.leadsCreated)} loading={loading} />
          <Kpi label="Visita ag. → Realizada" value={fmtPct(agg.visitsCompleted, agg.visitsScheduled)} loading={loading} />
          <Kpi label="Visita → Contrato" value={fmtPct(agg.wonContracts, agg.visitsCompleted)} loading={loading} />
        </div>

        {/* Funil */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil principal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funnelStages.map((s, i) => {
              const w = (s.value / funnelMax) * 100;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-44 text-sm text-slate-700 shrink-0">{s.label}</div>
                  <div className="flex-1 h-9 bg-slate-100 rounded-md overflow-hidden relative">
                    <div
                      className={s.highlight ? "h-full rounded-md ring-2 ring-emerald-400" : "h-full rounded-md"}
                      style={{ width: `${Math.max(w, 2)}%`, background: s.color }}
                    />
                    <div className="absolute inset-0 flex items-center px-3 text-sm font-medium text-slate-900">
                      {fmtInt(s.value)}
                      {i > 0 && funnelStages[i - 1].value > 0 && (
                        <span className="ml-2 text-xs text-slate-500">
                          ({((s.value / funnelStages[i - 1].value) * 100).toFixed(1)}% do anterior)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="pt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Rate label="form_open / sessões" v={formOpenRate} />
              <Rate label="lead / form_open" v={leadConvRate} />
              <Rate label="lead → visita ag." v={visitSchedRate} />
              <Rate label="visita ag. → realizada" v={visitShowRate} />
              <Rate label="visita real. → contrato" v={closeRate} />
              <Rate label="site → visita real." v={siteToVisit} />
              <Rate label="site → venda" v={siteToSale} />
            </div>
          </CardContent>
        </Card>

        {/* Série diária */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Série diária</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sessions" name="Sessões" fill="#94a3b8" />
                  <Bar dataKey="formOpens" name="Aberturas form" fill="#60a5fa" />
                  <Line type="monotone" dataKey="leads" name="Leads" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="visitsAgendadas" name="Visitas ag." stroke="#a855f7" strokeWidth={2} />
                  <Line type="monotone" dataKey="visitsRealizadas" name="Visitas real." stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="contratos" name="Contratos" stroke="#059669" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Tabela por origem/campanha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por origem / campanha</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                    <TableHead className="text-right">Aberturas</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">V. ag.</TableHead>
                    <TableHead className="text-right">V. real.</TableHead>
                    <TableHead className="text-right">Pré-res.</TableHead>
                    <TableHead className="text-right">Ganhos</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">L/Ab</TableHead>
                    <TableHead className="text-right">V.real/L</TableHead>
                    <TableHead className="text-right">G/V.real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center text-sm text-slate-500 py-8">
                        Nenhum dado no período.
                      </TableCell>
                    </TableRow>
                  )}
                  {campRows.map((r) => (
                    <TableRow key={`${r.source}|${r.medium}|${r.campaign}`}>
                      <TableCell className="text-sm">{r.source}</TableCell>
                      <TableCell className="text-sm">{r.medium}</TableCell>
                      <TableCell className="text-sm">{r.campaign}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(r.sessions)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(r.formOpens)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(r.leadsCreated)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(r.visitsScheduled)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmtInt(r.visitsCompleted)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(r.preReserves)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(r.wonContracts)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtBRL(r.soldRevenue)}</TableCell>
                      <TableCell className="text-right text-xs text-slate-500">{fmtPct(r.leadsCreated, r.formOpens)}</TableCell>
                      <TableCell className="text-right text-xs text-slate-500">{fmtPct(r.visitsCompleted, r.leadsCreated)}</TableCell>
                      <TableCell className="text-right text-xs text-slate-500">{fmtPct(r.wonContracts, r.visitsCompleted)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Quebra das aberturas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aberturas do formulário</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="text-xs text-slate-500">CTA do site (form_open_cta)</div>
              <div className="text-2xl font-semibold">{fmtInt(formOpenCtaTotal)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-slate-500">Botão flutuante (form_open_float)</div>
              <div className="text-2xl font-semibold">{fmtInt(formOpenFloatTotal)}</div>
            </div>
          </CardContent>
        </Card>
        {/* Debug admin: marketing_events */}
        {isAdmin && mevDebug && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader>
              <CardTitle className="text-base">
                Debug · marketing_events{" "}
                <span className="text-xs font-normal text-slate-500">
                  ({mevDebug.period.start} → {mevDebug.period.end}
                  {unitFilter ? ` · unit=${unitFilter.slice(0, 8)}…` : " · todas as unidades"})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-4">
                <div>
                  <span className="text-slate-500">Total no período:</span>{" "}
                  <strong>{fmtInt(mevDebug.total)}</strong>
                </div>
                {Object.entries(mevDebug.byEvent).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-slate-500">{k}:</span> <strong>{fmtInt(v)}</strong>
                  </div>
                ))}
                {mevDebug.error && (
                  <div className="text-red-700">
                    Erro: <code>{mevDebug.error}</code>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>created_at</TableHead>
                      <TableHead>event_name</TableHead>
                      <TableHead>form_slug</TableHead>
                      <TableHead>unit_id</TableHead>
                      <TableHead>session_id</TableHead>
                      <TableHead>utm_source</TableHead>
                      <TableHead>utm_medium</TableHead>
                      <TableHead>utm_campaign</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mevDebug.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-slate-500 py-4">
                          Nenhum evento.
                        </TableCell>
                      </TableRow>
                    )}
                    {mevDebug.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{r.created_at.slice(0, 19).replace("T", " ")}</TableCell>
                        <TableCell>{r.event_name}</TableCell>
                        <TableCell>{r.form_slug ?? "—"}</TableCell>
                        <TableCell className="font-mono">{r.unit_id ? r.unit_id.slice(0, 8) + "…" : "—"}</TableCell>
                        <TableCell className="font-mono">{r.session_id ? r.session_id.slice(0, 16) : "—"}</TableCell>
                        <TableCell>{r.utm_source ?? "—"}</TableCell>
                        <TableCell>{r.utm_medium ?? "—"}</TableCell>
                        <TableCell>{r.utm_campaign ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <Card className={highlight ? "border-emerald-300 bg-emerald-50/40" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-slate-500 flex items-center justify-between">
          <span>{label}</span>
          {highlight && <Badge className="bg-emerald-600 hover:bg-emerald-600">core</Badge>}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className={`text-2xl font-semibold mt-1 ${highlight ? "text-emerald-900" : "text-slate-900"}`}>
            {value}
          </div>
        )}
        {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Rate({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex justify-between rounded border bg-white px-2 py-1.5">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{(v * 100).toFixed(1)}%</span>
    </div>
  );
}
