import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useUnit } from "@/contexts/UnitContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

// ----------------- types -----------------
type ContractRow = {
  id: string;
  total_value: number | null;
  event_date: string | null;
  status: string;
  client_id: string | null;
};
type ClientRow = { id: string; source: string | null; cep: string | null };
type OppRow = { stage: string; estimated_value: number | null };

type Period = "2024" | "2025" | "2026" | "last12";

// ----------------- helpers -----------------
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta",
  ga: "Google Ads",
  indicacao: "Indicação",
  veio_em_festa: "Veio em festa",
  offline: "Off-line",
  ja_cliente: "Já é cliente",
  recorrencia: "Recorrência",
  outro: "Outro",
};

const STAGE_LABELS: Record<string, string> = {
  em_conversa: "Em conversa",
  visita_agendada: "Visita agendada",
  visita_realizada: "Visita realizada",
  pre_reserva: "Pré-reserva",
  ganho: "Ganho",
  perdido: "Perdido",
};
const STAGES = ["em_conversa", "visita_agendada", "visita_realizada", "pre_reserva", "ganho", "perdido"];

// known CEP prefix -> bairro (best-effort, opcional)
const CEP_REGION: Record<string, string> = {
  "04149": "Jd. da Saúde",
};

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function getRanges(period: Period): {
  current: [Date, Date];
  prior: [Date, Date];
  monthsCount: number;
  currentLabel: string;
  priorLabel: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "last12") {
    const end = today;
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
    const pStart = new Date(start);
    pStart.setFullYear(pStart.getFullYear() - 1);
    const pEnd = new Date(end);
    pEnd.setFullYear(pEnd.getFullYear() - 1);
    return {
      current: [start, end],
      prior: [pStart, pEnd],
      monthsCount: 12,
      currentLabel: "Últimos 12m",
      priorLabel: "12m anteriores",
    };
  }
  const y = parseInt(period, 10);
  const curYear = today.getFullYear();
  const start = new Date(y, 0, 1);
  // YTD if current year, else full year
  const end = y === curYear ? today : new Date(y, 11, 31);
  const pStart = new Date(y - 1, 0, 1);
  const pEnd = new Date(end);
  pEnd.setFullYear(pEnd.getFullYear() - 1);
  return {
    current: [start, end],
    prior: [pStart, pEnd],
    monthsCount: 12,
    currentLabel: String(y),
    priorLabel: String(y - 1),
  };
}

function inRange(d: Date, [a, b]: [Date, Date]): boolean {
  return d.getTime() >= a.getTime() && d.getTime() <= b.getTime();
}

function variation(current: number, prior: number): number | null {
  if (!prior) return null;
  return ((current - prior) / prior) * 100;
}

// ----------------- component -----------------
function DashboardPage() {
  const [period, setPeriod] = useState<Period>(String(new Date().getFullYear()) as Period);
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [opps, setOpps] = useState<OppRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, cl, op] = await Promise.all([
          supabase
            .from("contracts")
            .select("id,total_value,event_date,status,client_id")
            .eq("status", "assinado"),
          supabase.from("clients").select("id,source,cep"),
          supabase.from("opportunities").select("stage,estimated_value"),
        ]);
        if (!alive) return;
        if (c.error) throw c.error;
        if (cl.error) throw cl.error;
        if (op.error) throw op.error;
        setContracts((c.data ?? []) as ContractRow[]);
        setClients((cl.data ?? []) as ClientRow[]);
        setOpps((op.data ?? []) as OppRow[]);
      } catch (e: any) {
        setError(e.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loading = !contracts || !clients || !opps;

  const ranges = useMemo(() => getRanges(period), [period]);

  // contracts with date
  const dated = useMemo(
    () =>
      (contracts ?? [])
        .map((c) => ({ ...c, _d: parseDate(c.event_date), _v: Number(c.total_value ?? 0) }))
        .filter((c) => c._d),
    [contracts],
  );

  // KPIs
  const kpis = useMemo(() => {
    const cur = dated.filter((c) => inRange(c._d!, ranges.current));
    const prv = dated.filter((c) => inRange(c._d!, ranges.prior));
    const sum = (a: { _v: number }[]) => a.reduce((s, x) => s + x._v, 0);
    const curRev = sum(cur);
    const prvRev = sum(prv);
    const curCount = cur.length;
    const prvCount = prv.length;
    const curAvg = curCount ? curRev / curCount : 0;
    const prvAvg = prvCount ? prvRev / prvCount : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const next = dated.filter((c) => c._d! >= today && c._d! <= in30);
    return {
      revenue: { value: curRev, var: variation(curRev, prvRev) },
      count: { value: curCount, var: variation(curCount, prvCount) },
      avg: { value: curAvg, var: variation(curAvg, prvAvg) },
      next30: { count: next.length, value: next.reduce((s, x) => s + x._v, 0) },
    };
  }, [dated, ranges]);

  // Trend (monthly): current period months
  const trend = useMemo(() => {
    const [s, e] = ranges.current;
    // build month buckets between s and e
    const months: { year: number; month: number; label: string }[] = [];
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    const stop = new Date(e.getFullYear(), e.getMonth(), 1);
    while (cur <= stop) {
      months.push({
        year: cur.getFullYear(),
        month: cur.getMonth(),
        label: `${MONTH_LABELS[cur.getMonth()]}/${String(cur.getFullYear()).slice(2)}`,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return months.map((m) => {
      const curRows = dated.filter(
        (c) => c._d!.getFullYear() === m.year && c._d!.getMonth() === m.month,
      );
      const prvRows = dated.filter(
        (c) => c._d!.getFullYear() === m.year - 1 && c._d!.getMonth() === m.month,
      );
      const curRev = curRows.reduce((s2, x) => s2 + x._v, 0);
      const prvRev = prvRows.reduce((s2, x) => s2 + x._v, 0);
      return {
        label: m.label,
        atual: curRev,
        anterior: prvRev,
        ticket: curRows.length ? curRev / curRows.length : 0,
        atualCount: curRows.length,
        anteriorCount: prvRows.length,
      };
    });
  }, [dated, ranges]);

  // 3a — by weekday (full dataset, todos os anos)
  const byDow = useMemo(() => {
    const buckets = Array.from({ length: 7 }, () => ({ count: 0, sum: 0 }));
    for (const c of dated) {
      const dow = c._d!.getDay();
      buckets[dow].count += 1;
      buckets[dow].sum += c._v;
    }
    // ordenar Seg..Dom
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.map((i) => ({
      label: DOW_LABELS[i],
      festas: buckets[i].count,
      ticket: buckets[i].count ? buckets[i].sum / buckets[i].count : 0,
    }));
  }, [dated]);

  // 3b — sazonalidade: média de festas por mês (sobre anos disponíveis)
  const sazonal = useMemo(() => {
    const years = new Set(dated.map((c) => c._d!.getFullYear()));
    const yearsCount = Math.max(1, years.size);
    const buckets = Array(12).fill(0);
    for (const c of dated) buckets[c._d!.getMonth()] += 1;
    return MONTH_LABELS.map((l, i) => ({
      label: l,
      media: buckets[i] / yearsCount,
    }));
  }, [dated]);

  // 3c — mix de origem (clientes que fecharam)
  const mixOrigem = useMemo(() => {
    const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));
    const closedClientIds = new Set(dated.map((c) => c.client_id).filter(Boolean) as string[]);
    const counts: Record<string, number> = {};
    for (const id of closedClientIds) {
      const cl = clientMap.get(id);
      const key = cl?.source ?? "__null";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([k, v]) => ({ label: k === "__null" ? "Sem registro" : SOURCE_LABELS[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value);
  }, [dated, clients]);

  // 3d — top CEPs
  const topCeps = useMemo(() => {
    const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));
    const closedClientIds = new Set(dated.map((c) => c.client_id).filter(Boolean) as string[]);
    const counts: Record<string, number> = {};
    for (const id of closedClientIds) {
      const cl = clientMap.get(id);
      if (!cl?.cep) continue;
      const prefix = cl.cep.replace(/\D/g, "").slice(0, 5);
      if (!prefix) continue;
      counts[prefix] = (counts[prefix] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([k, v]) => ({
        label: CEP_REGION[k] ? `${k} (${CEP_REGION[k]})` : k,
        value: v,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [dated, clients]);

  // pipeline
  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s] = 0;
    let active = 0;
    let openValue = 0;
    for (const o of opps ?? []) {
      counts[o.stage] = (counts[o.stage] ?? 0) + 1;
      if (o.stage !== "ganho" && o.stage !== "perdido") {
        active += 1;
        if (o.estimated_value != null) openValue += Number(o.estimated_value);
      }
    }
    return { counts, active, openValue };
  }, [opps]);

  return (
    <AppLayout title="Dashboard">
      {/* período */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm text-slate-500 mr-2">Período:</span>
        {(["2024", "2025", "2026", "last12"] as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === "last12" ? "Últimos 12 meses" : p}
          </Button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao carregar dados: {error}
        </div>
      )}

      {/* SEÇÃO 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard title="Receita" value={fmtBRL(kpis.revenue.value)} variation={kpis.revenue.var} />
            <KpiCard title="Festas fechadas" value={String(kpis.count.value)} variation={kpis.count.var} />
            <KpiCard title="Ticket médio" value={fmtBRL(kpis.avg.value)} variation={kpis.avg.var} />
            <KpiCard
              title="Próximas 30 dias"
              value={String(kpis.next30.count)}
              subtitle={fmtBRL(kpis.next30.value)}
            />
          </>
        )}
      </div>

      {/* SEÇÃO 2 — Tendência */}
      <h2 className="text-base font-semibold text-slate-900 mb-3">Tendência</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
        <ChartCard title={`Receita e ticket por mês (${ranges.currentLabel} vs ${ranges.priorLabel})`}>
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : trend.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Bar yAxisId="left" dataKey="anterior" name={ranges.priorLabel} fill="#a7f3d0" />
                <Bar yAxisId="left" dataKey="atual" name={ranges.currentLabel} fill="#10b981" />
                <Line yAxisId="right" type="monotone" dataKey="ticket" name="Ticket médio" stroke="#0f172a" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Volume de festas por mês (${ranges.currentLabel} vs ${ranges.priorLabel})`}>
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : trend.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="anteriorCount" name={ranges.priorLabel} fill="#a7f3d0" />
                <Bar dataKey="atualCount" name={ranges.currentLabel} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* SEÇÃO 3 — Inteligência */}
      <h2 className="text-base font-semibold text-slate-900 mb-3">Inteligência de negócio</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
        <ChartCard title="Distribuição por dia da semana (volume + ticket)">
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={byDow}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === "Ticket médio" ? fmtBRL(v) : String(v)
                  }
                />
                <Legend />
                <Bar yAxisId="left" dataKey="festas" name="Festas" fill="#10b981" />
                <Line yAxisId="right" type="monotone" dataKey="ticket" name="Ticket médio" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sazonalidade por mês (média histórica)">
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sazonal}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => v.toFixed(1)} />
                <Bar dataKey="media" name="Festas/mês (média)" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Mix de origem dos clientes que fecharam">
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : mixOrigem.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, mixOrigem.length * 32)}>
              <BarChart data={mixOrigem} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="label" type="category" fontSize={11} width={120} />
                <Tooltip />
                <Bar dataKey="value" name="Clientes" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Concentração geográfica — Top 10 CEPs">
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : topCeps.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, topCeps.length * 30)}>
              <BarChart data={topCeps} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="label" type="category" fontSize={11} width={150} />
                <Tooltip />
                <Bar dataKey="value" name="Clientes" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* SEÇÃO 4 — Pipeline */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-900">Pipeline atual</h2>
        <Link to="/oportunidades" className="text-sm text-emerald-700 hover:underline">
          Ver todas →
        </Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-5">
                {STAGES.map((s) => (
                  <Badge key={s} variant="secondary" className="text-sm px-3 py-1">
                    {STAGE_LABELS[s]}: <span className="ml-1 font-semibold">{pipeline.counts[s] ?? 0}</span>
                  </Badge>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-md border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Oportunidades ativas</div>
                  <div className="text-2xl font-semibold text-slate-900 mt-1">{pipeline.active}</div>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">Valor estimado em aberto</div>
                  <div className="text-2xl font-semibold text-slate-900 mt-1">{fmtBRL(pipeline.openValue)}</div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}

// ----------------- small components -----------------
function KpiCard({
  title,
  value,
  variation,
  subtitle,
}: {
  title: string;
  value: string;
  variation?: number | null;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
        {variation !== undefined && variation !== null && (
          <div
            className={`flex items-center gap-1 text-xs mt-2 ${
              variation >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {variation >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(variation).toFixed(1)}% vs período anterior
          </div>
        )}
        {variation === null && (
          <div className="text-xs text-slate-400 mt-2">sem base anterior</div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
      Sem dados no período
    </div>
  );
}
