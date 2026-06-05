import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ComposedChart,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
type RangeKey = "7d" | "30d" | "this_month" | "last_month" | "custom";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Range = { start: string; end: string; prevStart: string; prevEnd: string };

function rangeFor(key: RangeKey, customStart?: string, customEnd?: string): Range {
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
    // end = hoje
  } else if (key === "last_month") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (key === "custom" && customStart && customEnd) {
    start = new Date(`${customStart}T00:00:00`);
    end = new Date(`${customEnd}T00:00:00`);
  }

  // Período anterior: para "this_month" => mês anterior até dia equivalente.
  let prevStart: Date;
  let prevEnd: Date;
  if (key === "this_month") {
    prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  } else {
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (days - 1));
  }

  return {
    start: toISODate(start),
    end: toISODate(end),
    prevStart: toISODate(prevStart),
    prevEnd: toISODate(prevEnd),
  };
}

const fmtInt = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

function deltaPct(curr: number, prev: number): { txt: string; up: boolean | null } {
  if (prev === 0) return { txt: curr > 0 ? "novo" : "—", up: curr > 0 ? true : null };
  const d = ((curr - prev) / prev) * 100;
  const up = d >= 0;
  return { txt: `${up ? "+" : ""}${d.toFixed(1)}%`, up };
}

// --- types -------------------------------------------------------------------
type LeadAttr = {
  source: string;
  medium: string;
  campaign: string;
  date: string; // YYYY-MM-DD
};

type CampRow = {
  source: string;
  medium: string;
  campaign: string;
  users: number;
  sessions: number;
  formOpens: number;
  leads: number;
};

// --- page --------------------------------------------------------------------
function MarketingPage() {
  const { unitFilter } = useUnit();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.tenant_role === "owner";

  const [range, setRange] = useState<RangeKey>("this_month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [mediumFilter, setMediumFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [topMode, setTopMode] = useState<"leads" | "formOpens">("leads");

  const [ga, setGa] = useState<MarketingOverview | null>(null);
  const [gaPrev, setGaPrev] = useState<MarketingOverview | null>(null);
  const [leads, setLeads] = useState<LeadAttr[]>([]);
  const [prevLeadsCount, setPrevLeadsCount] = useState(0);

  type MevRow = {
    created_at: string;
    event_name: string;
    form_slug: string | null;
    unit_id: string | null;
    session_id: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
  };
  const [mevDebug, setMevDebug] = useState<{
    total: number;
    byEvent: Record<string, number>;
    rows: MevRow[];
    error: string | null;
  } | null>(null);

  const fetchOverview = useServerFn(getMarketingOverview);

  const r = useMemo(
    () => rangeFor(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);

      // ---- Leads (Supabase) ----
      const loadLeads = async (start: string, end: string): Promise<LeadAttr[]> => {
        let q = supabase
          .from("opportunities")
          .select("id, created_at, utm_source, utm_medium, utm_campaign")
          .gte("created_at", `${start}T00:00:00`)
          .lte("created_at", `${end}T23:59:59`);
        if (unitFilter) q = q.eq("unit_id", unitFilter);
        const { data } = await q;
        return (data ?? []).map((o) => ({
          source: o.utm_source && o.utm_source.trim() !== "" ? o.utm_source : "(direct)",
          medium: o.utm_medium && o.utm_medium.trim() !== "" ? o.utm_medium : "(none)",
          campaign: o.utm_campaign && o.utm_campaign.trim() !== "" ? o.utm_campaign : "(not set)",
          date: (o.created_at as string).slice(0, 10),
        }));
      };

      // ---- GA4 ----
      const loadGa = async (start: string, end: string): Promise<MarketingOverview | null> => {
        try {
          return await fetchOverview({
            data: {
              start,
              end,
              source: sourceFilter !== "all" ? sourceFilter : undefined,
              medium: mediumFilter !== "all" ? mediumFilter : undefined,
              campaign: campaignFilter !== "all" ? campaignFilter : undefined,
            },
          });
        } catch (e) {
          return {
            gaConfigured: false,
            gaError: (e as Error).message,
            sessions: 0,
            users: 0,
            formOpens: 0,
            formOpenCta: 0,
            formOpenFloat: 0,
            daily: [],
            byCampaign: [],
          };
        }
      };

      const [curLeads, prevLeadsArr, curGa, prevGa] = await Promise.all([
        loadLeads(r.start, r.end),
        loadLeads(r.prevStart, r.prevEnd),
        loadGa(r.start, r.end),
        loadGa(r.prevStart, r.prevEnd),
      ]);

      if (cancel) return;
      setLeads(curLeads);
      setPrevLeadsCount(prevLeadsArr.length);
      setGa(curGa);
      setGaPrev(prevGa);

      // ---- Debug marketing_events (admin only) ----
      if (isAdmin) {
        try {
          const startIso = `${r.start}T00:00:00-03:00`;
          const endIso = `${r.end}T23:59:59.999-03:00`;
          let mevQ = supabase
            .from("marketing_events")
            .select("event_name, session_id, created_at, utm_source, utm_medium, utm_campaign, form_slug, unit_id")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .order("created_at", { ascending: false })
            .limit(50000);
          if (unitFilter) mevQ = mevQ.eq("unit_id", unitFilter);
          const { data: mev, error: mevErr } = await mevQ;
          if (cancel) return;
          const mevRows = (mev ?? []) as unknown as MevRow[];
          const byEvent: Record<string, number> = {};
          for (const e of mevRows) byEvent[e.event_name] = (byEvent[e.event_name] ?? 0) + 1;
          setMevDebug({
            total: mevRows.length,
            byEvent,
            rows: mevRows.slice(0, 20),
            error: mevErr?.message ?? null,
          });
        } catch (e) {
          if (!cancel) setMevDebug({ total: 0, byEvent: {}, rows: [], error: (e as Error).message });
        }
      }

      setLoading(false);
    }
    load();
    return () => {
      cancel = true;
    };
  }, [r.start, r.end, r.prevStart, r.prevEnd, unitFilter, sourceFilter, mediumFilter, campaignFilter, fetchOverview, isAdmin]);

  // ---- Derived ----
  const users = ga?.users ?? 0;
  const sessions = ga?.sessions ?? 0;
  const formOpens = ga?.formOpens ?? 0;
  const formOpenCta = ga?.formOpenCta ?? 0;
  const formOpenFloat = ga?.formOpenFloat ?? 0;
  const leadsCount = leads.length;

  const usersPrev = gaPrev?.users ?? 0;
  const sessionsPrev = gaPrev?.sessions ?? 0;
  const formOpensPrev = gaPrev?.formOpens ?? 0;

  const convOpenLead = formOpens > 0 ? leadsCount / formOpens : 0;
  const convOpenLeadPrev = formOpensPrev > 0 ? prevLeadsCount / formOpensPrev : 0;
  const abandono = formOpens > 0 ? 1 - leadsCount / formOpens : 0;
  const convUserLead = users > 0 ? leadsCount / users : 0;

  // Daily series (users/aperturas/leads)
  const leadsByDate = new Map<string, number>();
  for (const l of leads) leadsByDate.set(l.date, (leadsByDate.get(l.date) ?? 0) + 1);
  const dailyMap = new Map<string, { date: string; users: number; formOpens: number; leads: number }>();
  const ensureDay = (d: string) => {
    let row = dailyMap.get(d);
    if (!row) {
      row = { date: d, users: 0, formOpens: 0, leads: 0 };
      dailyMap.set(d, row);
    }
    return row;
  };
  (ga?.daily ?? []).forEach((g) => {
    const row = ensureDay(g.date);
    row.users = g.users;
    row.formOpens = g.formOpenCta + g.formOpenFloat;
  });
  leadsByDate.forEach((v, k) => (ensureDay(k).leads = v));
  const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Performance por canal — merge GA4 + leads Supabase
  const campMap = new Map<string, CampRow>();
  const getCamp = (s: string, m: string, c: string) => {
    const k = `${s}|${m}|${c}`;
    let row = campMap.get(k);
    if (!row) {
      row = { source: s, medium: m, campaign: c, users: 0, sessions: 0, formOpens: 0, leads: 0 };
      campMap.set(k, row);
    }
    return row;
  };
  (ga?.byCampaign ?? []).forEach((g) => {
    const row = getCamp(g.source, g.medium, g.campaign);
    row.sessions = g.sessions;
    row.formOpens = g.formOpens;
    // GA4 byCampaign não inclui users por linha; aproximamos via sessões (display)
    row.users = Math.max(row.users, 0);
  });
  for (const l of leads) {
    getCamp(l.source, l.medium, l.campaign).leads++;
  }

  let campRows = Array.from(campMap.values());
  if (sourceFilter !== "all") campRows = campRows.filter((r) => r.source === sourceFilter);
  if (mediumFilter !== "all") campRows = campRows.filter((r) => r.medium === mediumFilter);
  if (campaignFilter !== "all") campRows = campRows.filter((r) => r.campaign === campaignFilter);
  campRows.sort((a, b) => (b.leads - a.leads) || (b.formOpens - a.formOpens));

  const sourceOptions = Array.from(new Set(Array.from(campMap.values()).map((c) => c.source))).sort();
  const mediumOptions = Array.from(new Set(Array.from(campMap.values()).map((c) => c.medium))).sort();
  const campaignOptions = Array.from(new Set(Array.from(campMap.values()).map((c) => c.campaign))).sort();

  // Top campanhas
  const topCampaigns = [...campRows]
    .sort((a, b) => (topMode === "leads" ? b.leads - a.leads : b.formOpens - a.formOpens))
    .slice(0, 10)
    .map((r) => ({
      name: `${r.source} · ${r.campaign}`.slice(0, 40),
      leads: r.leads,
      formOpens: r.formOpens,
    }));

  return (
    <AppLayout title="Marketing">
      <div className="space-y-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[170px]">
            <label className="text-xs text-slate-500">Período</label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Mês vigente</SelectItem>
                <SelectItem value="last_month">Mês anterior</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "custom" && (
            <>
              <div>
                <label className="text-xs text-slate-500">De</label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Até</label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <div className="min-w-[150px]">
            <label className="text-xs text-slate-500">Source</label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs text-slate-500">Medium</label>
            <Select value={mediumFilter} onValueChange={setMediumFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {mediumOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs text-slate-500">Campaign</label>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {campaignOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-slate-500 text-right">
            <div>{r.start} → {r.end}</div>
            <div className="text-[10px] text-slate-400">vs {r.prevStart} → {r.prevEnd}</div>
          </div>
        </div>

        {/* GA4 status banner */}
        {ga && !ga.gaConfigured && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-sm text-blue-900 flex items-center justify-between gap-4">
              <div>
                <strong>Conecte o Google Analytics.</strong> Sem GA4, usuários, sessões e aberturas do formulário ficam zerados. Leads continuam sendo lidos do banco.
              </div>
              {isAdmin && (
                <a
                  href="/configuracoes/integracoes"
                  className="shrink-0 inline-flex items-center px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  Conectar Google Analytics
                </a>
              )}
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
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Kpi label="Usuários" value={fmtInt(users)} delta={deltaPct(users, usersPrev)} loading={loading} />
          <Kpi label="Sessões" value={fmtInt(sessions)} delta={deltaPct(sessions, sessionsPrev)} loading={loading} />
          <Kpi
            label="Aberturas do form"
            value={fmtInt(formOpens)}
            sub={`CTA ${fmtInt(formOpenCta)} · Float ${fmtInt(formOpenFloat)}`}
            delta={deltaPct(formOpens, formOpensPrev)}
            loading={loading}
          />
          <Kpi label="Leads" value={fmtInt(leadsCount)} delta={deltaPct(leadsCount, prevLeadsCount)} loading={loading} highlight />
          <Kpi
            label="Conv. abertura → lead"
            value={fmtPct(leadsCount, formOpens)}
            delta={deltaPct(convOpenLead * 1000, convOpenLeadPrev * 1000)}
            loading={loading}
          />
          <Kpi label="Abandono do form" value={formOpens > 0 ? `${(abandono * 100).toFixed(1)}%` : "—"} loading={loading} />
          <Kpi label="Conv. usuário → lead" value={fmtPct(leadsCount, users)} loading={loading} />
        </div>

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
                  <Bar dataKey="users" name="Usuários" fill="#94a3b8" />
                  <Bar dataKey="formOpens" name="Aberturas" fill="#60a5fa" />
                  <Line type="monotone" dataKey="leads" name="Leads" stroke="#3b82f6" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top campanhas + Quebra de aberturas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Top 10 campanhas</CardTitle>
              <Select value={topMode} onValueChange={(v) => setTopMode(v as "leads" | "formOpens")}>
                <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">por Leads</SelectItem>
                  <SelectItem value="formOpens">por Aberturas</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCampaigns} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={180} />
                    <Tooltip />
                    <Bar dataKey={topMode} fill={topMode === "leads" ? "#3b82f6" : "#60a5fa"} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quebra de aberturas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border p-4">
                <div className="text-xs text-slate-500">CTA do site (form_open_cta)</div>
                <div className="text-2xl font-semibold">{fmtInt(formOpenCta)}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-xs text-slate-500">Botão flutuante (form_open_float)</div>
                <div className="text-2xl font-semibold">{fmtInt(formOpenFloat)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance por canal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance por canal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                    <TableHead className="text-right">Aberturas</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Ab/User</TableHead>
                    <TableHead className="text-right">Lead/Ab</TableHead>
                    <TableHead className="text-right">Lead/User</TableHead>
                    <TableHead className="text-right">Abandono</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-sm text-slate-500 py-8">
                        Nenhum dado no período.
                      </TableCell>
                    </TableRow>
                  )}
                  {campRows.map((r) => {
                    const aband = r.formOpens > 0 ? 1 - r.leads / r.formOpens : 0;
                    return (
                      <TableRow key={`${r.source}|${r.medium}|${r.campaign}`}>
                        <TableCell className="text-sm">{r.source}</TableCell>
                        <TableCell className="text-sm">{r.medium}</TableCell>
                        <TableCell className="text-sm">{r.campaign}</TableCell>
                        <TableCell className="text-right text-sm">{fmtInt(r.users)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtInt(r.sessions)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtInt(r.formOpens)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmtInt(r.leads)}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">{fmtPct(r.formOpens, r.users)}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">{fmtPct(r.leads, r.formOpens)}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">{fmtPct(r.leads, r.users)}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {r.formOpens > 0 ? `${(aband * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Debug admin (recolhido) */}
        {isAdmin && (
          <Card className="border-slate-200">
            <CardHeader className="cursor-pointer" onClick={() => setShowDebug((s) => !s)}>
              <CardTitle className="text-sm text-slate-600">
                {showDebug ? "▾" : "▸"} Debug · marketing_events (admin)
              </CardTitle>
            </CardHeader>
            {showDebug && mevDebug && (
              <CardContent className="space-y-3 text-xs">
                <div className="flex flex-wrap gap-4">
                  <div><span className="text-slate-500">Total:</span> <strong>{fmtInt(mevDebug.total)}</strong></div>
                  {Object.entries(mevDebug.byEvent).map(([k, v]) => (
                    <div key={k}><span className="text-slate-500">{k}:</span> <strong>{fmtInt(v)}</strong></div>
                  ))}
                  {mevDebug.error && <div className="text-red-700">Erro: <code>{mevDebug.error}</code></div>}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>created_at</TableHead>
                        <TableHead>event_name</TableHead>
                        <TableHead>form_slug</TableHead>
                        <TableHead>session_id</TableHead>
                        <TableHead>utm_source</TableHead>
                        <TableHead>utm_medium</TableHead>
                        <TableHead>utm_campaign</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mevDebug.rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono">{r.created_at.slice(0, 19).replace("T", " ")}</TableCell>
                          <TableCell>{r.event_name}</TableCell>
                          <TableCell>{r.form_slug ?? "—"}</TableCell>
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
            )}
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
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  loading?: boolean;
  delta?: { txt: string; up: boolean | null };
}) {
  return (
    <Card className={highlight ? "border-emerald-300 bg-emerald-50/40" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-slate-500">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className={`text-2xl font-semibold mt-1 ${highlight ? "text-emerald-900" : "text-slate-900"}`}>
            {value}
          </div>
        )}
        {delta && !loading && (
          <div
            className={`text-[11px] mt-1 ${
              delta.up === null ? "text-slate-400" : delta.up ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {delta.txt} vs período anterior
          </div>
        )}
        {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
