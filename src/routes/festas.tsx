import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ContractStatus = "assinado" | "aguardando_assinaturas" | "cancelado";

type Festa = {
  id: string;
  clicksign_document_key: string | null;
  status: ContractStatus;
  event_date: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  event_weekday_raw: string | null;
  guest_count: number | null;
  celebrant_name: string | null;
  celebrant_age: number | null;
  children_pay_from_age: number | null;
  decoration: string | null;
  cake: string | null;
  tasting_menu: string | null;
  hot_dish: string | null;
  kids_menu: string | null;
  additional_services: string | null;
  observations: string | null;
  total_value: number | null;
  installment_count: number | null;
  payment_method: string | null;
  payment_schedule_raw: string | null;
  contracted_company_email: string | null;
  contract_form_date: string | null;
  client_signed_at: string | null;
  manager_signed_at: string | null;
  finalized_at: string | null;
  created_at: string;
  raw_webhook_payload: unknown;
  client: {
    id: string;
    full_name: string;
    cpf: string;
    email: string | null;
    phone: string | null;
    address_full: string | null;
    how_met: string | null;
    mother_name: string | null;
    father_name: string | null;
  } | null;
  installments_sum: number;
  installments_generated: number;
};

type Installment = {
  id: string;
  order_index: number;
  due_date: string;
  amount: number;
  payment_method: string;
  paid: boolean;
  paid_at: string | null;
  payment_status: string | null;
  raw_line: string | null;
};

export const Route = createFileRoute("/festas")({
  component: FestasPage,
});

// ---------- formatters ----------
const fmtBRL = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n));

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const [y, m, d] = s.split("T")[0].split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return "—";
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s;
  return dt.toLocaleString("pt-BR");
};

const fmtTime = (s: string | null | undefined) => {
  if (!s) return "—";
  return s.slice(0, 5);
};

const fmtCPF = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = s.replace(/\D/g, "");
  if (d.length !== 11) return s;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const fmtPhone = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = s.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
};

function statusBadge(status: ContractStatus) {
  if (status === "assinado")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Assinado</Badge>;
  if (status === "cancelado")
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Aguardando assinaturas</Badge>;
}

function financialBadge(f: Festa) {
  const diff = Number(f.total_value ?? 0) - Number(f.installments_sum ?? 0);
  const countMismatch = (f.installment_count ?? 0) !== f.installments_generated;
  const ok = Math.abs(diff) < 0.01 && !countMismatch;
  return ok ? (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Financeiro OK</Badge>
  ) : (
    <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Divergência financeira</Badge>
  );
}

// ---------- page ----------
function FestasPage() {
  const { session } = useAuth();
  const [festas, setFestas] = useState<Festa[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Festa | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [showPayload, setShowPayload] = useState(false);

  // filters
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<string>("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payF, setPayF] = useState<string>("todos");
  const [finF, setFinF] = useState<string>("todos");

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: contracts, error } = await supabase
        .from("contracts")
        .select(
          `id, clicksign_document_key, status, event_date, event_start_time, event_end_time, event_weekday_raw,
           guest_count, celebrant_name, celebrant_age, children_pay_from_age, decoration, cake, tasting_menu,
           hot_dish, kids_menu, additional_services, observations, total_value, installment_count, payment_method,
           payment_schedule_raw, contracted_company_email, contract_form_date, client_signed_at, manager_signed_at,
           finalized_at, created_at, raw_webhook_payload, client_id,
           client:clients!contracts_client_id_fkey(id, full_name, cpf, email, phone, address_full, how_met, mother_name, father_name)`,
        )
        .order("created_at", { ascending: false });
      if (error) {
        // fallback without explicit FK name
        const r2 = await supabase
          .from("contracts")
          .select("*, client:clients(id, full_name, cpf, email, phone, address_full, how_met, mother_name, father_name)")
          .order("created_at", { ascending: false });
        if (r2.error) {
          setErr(r2.error.message);
          return;
        }
        await hydrate(r2.data ?? []);
        return;
      }
      await hydrate(contracts ?? []);
    })();

    async function hydrate(rows: unknown[]) {
      const ids = rows.map((r: any) => r.id);
      let sums = new Map<string, { sum: number; count: number }>();
      if (ids.length > 0) {
        const { data: ins } = await supabase
          .from("contract_installments")
          .select("contract_id, amount")
          .in("contract_id", ids);
        for (const row of ins ?? []) {
          const cur = sums.get(row.contract_id) ?? { sum: 0, count: 0 };
          cur.sum += Number(row.amount);
          cur.count += 1;
          sums.set(row.contract_id, cur);
        }
      }
      const result: Festa[] = (rows as any[]).map((r) => ({
        ...r,
        client: Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null,
        installments_sum: sums.get(r.id)?.sum ?? 0,
        installments_generated: sums.get(r.id)?.count ?? 0,
      }));
      setFestas(result);
    }
  }, [session]);

  // load installments when a festa is selected
  useEffect(() => {
    if (!selected) {
      setInstallments([]);
      setShowPayload(false);
      return;
    }
    supabase
      .from("contract_installments")
      .select("id, order_index, due_date, amount, payment_method, paid, paid_at, payment_status, raw_line")
      .eq("contract_id", selected.id)
      .order("order_index", { ascending: true })
      .then(({ data }) => setInstallments((data ?? []) as Installment[]));
  }, [selected]);

  const filtered = useMemo(() => {
    if (!festas) return [];
    const term = q.trim().toLowerCase();
    let arr = festas.filter((f) => {
      if (term) {
        const hay = [
          f.client?.full_name,
          f.client?.cpf,
          f.celebrant_name,
          f.clicksign_document_key,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (statusF !== "todos" && f.status !== statusF) return false;
      if (from && (!f.event_date || f.event_date < from)) return false;
      if (to && (!f.event_date || f.event_date > to)) return false;
      if (payF !== "todos") {
        const pm = (f.payment_method ?? "").toLowerCase();
        if (!pm.includes(payF.toLowerCase())) return false;
      }
      if (finF !== "todos") {
        const diff = Number(f.total_value ?? 0) - Number(f.installments_sum ?? 0);
        const ok =
          Math.abs(diff) < 0.01 &&
          (f.installment_count ?? 0) === f.installments_generated;
        if (finF === "ok" && !ok) return false;
        if (finF === "div" && ok) return false;
      }
      return true;
    });
    const today = new Date().toISOString().slice(0, 10);
    arr = arr.sort((a, b) => {
      const aHas = !!a.event_date;
      const bHas = !!b.event_date;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (aHas && bHas) {
        const aFut = a.event_date! >= today;
        const bFut = b.event_date! >= today;
        if (aFut && !bFut) return -1;
        if (!aFut && bFut) return 1;
        if (a.event_date! !== b.event_date!) {
          return a.event_date! < b.event_date! ? -1 : 1;
        }
      }
      return a.created_at < b.created_at ? 1 : -1;
    });
    return arr;
  }, [festas, q, statusF, from, to, payF, finF]);

  // top cards
  const stats = useMemo(() => {
    const list = festas ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const assinadas = list.filter((f) => f.status === "assinado");
    return {
      total: list.length,
      assinadas: assinadas.length,
      proximas: assinadas.filter((f) => f.event_date && f.event_date >= today).length,
      receita: assinadas.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
    };
  }, [festas]);

  return (
    <AppLayout title="Festas">
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total de festas" value={String(stats.total)} />
        <StatCard label="Festas assinadas" value={String(stats.assinadas)} />
        <StatCard label="Próximas festas" value={String(stats.proximas)} />
        <StatCard label="Receita contratada" value={fmtBRL(stats.receita)} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 grid grid-cols-1 md:grid-cols-6 gap-2">
        <Input
          placeholder="Buscar cliente, CPF, aniversariante, document key…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:col-span-2"
        />
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="assinado">Assinado</SelectItem>
            <SelectItem value="aguardando_assinaturas">Aguardando</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={payF} onValueChange={setPayF}>
          <SelectTrigger><SelectValue placeholder="Pagamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas formas</SelectItem>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="cartão">Cartão</SelectItem>
            <SelectItem value="dinheiro">Dinheiro</SelectItem>
            <SelectItem value="transf">Transf/TED</SelectItem>
          </SelectContent>
        </Select>
        <Select value={finF} onValueChange={setFinF}>
          <SelectTrigger><SelectValue placeholder="Financeiro" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos financeiros</SelectItem>
            <SelectItem value="ok">Financeiro OK</SelectItem>
            <SelectItem value="div">Divergência</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 md:col-span-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {err && <div className="p-4 text-sm text-red-600">Não foi possível carregar as festas agora. ({err})</div>}
        {!festas && !err && <div className="p-6 text-sm text-slate-500">Carregando…</div>}
        {festas && filtered.length === 0 && !err && (
          <div className="p-8 text-sm text-slate-500 text-center">
            Nenhuma festa encontrada ainda. As festas aparecerão aqui quando forem finalizadas na Clicksign.
          </div>
        )}
        {festas && filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aniversariante</TableHead>
                <TableHead>Idade</TableHead>
                <TableHead>Convidados</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Financeiro</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{fmtDate(f.event_date)}</TableCell>
                  <TableCell>
                    {fmtTime(f.event_start_time)}
                    {f.event_end_time ? ` – ${fmtTime(f.event_end_time)}` : ""}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{f.client?.full_name ?? "—"}</TableCell>
                  <TableCell>{f.celebrant_name ?? "—"}</TableCell>
                  <TableCell>{f.celebrant_age ?? "—"}</TableCell>
                  <TableCell>{f.guest_count ?? "—"}</TableCell>
                  <TableCell>{fmtBRL(f.total_value)}</TableCell>
                  <TableCell className="max-w-[120px] truncate">{f.payment_method ?? "—"}</TableCell>
                  <TableCell>{f.installment_count ?? "—"}</TableCell>
                  <TableCell>{statusBadge(f.status)}</TableCell>
                  <TableCell>{financialBadge(f)}</TableCell>
                  <TableCell className="text-xs text-slate-500">{fmtDateTime(f.created_at)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(f)}>Ver detalhes</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <DetailContent
              f={selected}
              installments={installments}
              showPayload={showPayload}
              onTogglePayload={() => setShowPayload((v) => !v)}
            />
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">{value ?? "—"}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-200 pt-4 mt-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DetailContent({
  f,
  installments,
  showPayload,
  onTogglePayload,
}: {
  f: Festa;
  installments: Installment[];
  showPayload: boolean;
  onTogglePayload: () => void;
}) {
  const diff = Number(f.total_value ?? 0) - Number(f.installments_sum ?? 0);
  const countMismatch = (f.installment_count ?? 0) !== f.installments_generated;
  const ok = Math.abs(diff) < 0.01 && !countMismatch;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Festa — {f.celebrant_name ?? "Sem aniversariante"}</SheetTitle>
      </SheetHeader>

      <Section title="Resumo">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" value={statusBadge(f.status)} />
          <Field label="Status financeiro" value={financialBadge(f)} />
          <Field label="Clicksign document key" value={<span className="text-xs font-mono">{f.clicksign_document_key ?? "—"}</span>} />
          <Field label="Criado em" value={fmtDateTime(f.created_at)} />
          <Field label="Finalizado em" value={fmtDateTime(f.finalized_at)} />
          <Field label="Data do contrato" value={fmtDate(f.contract_form_date)} />
        </div>
      </Section>

      <Section title="Cliente">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome completo" value={f.client?.full_name} />
          <Field label="CPF" value={fmtCPF(f.client?.cpf)} />
          <Field label="E-mail" value={f.client?.email} />
          <Field label="Celular" value={fmtPhone(f.client?.phone)} />
          <Field label="Endereço" value={f.client?.address_full} />
          <Field label="Como conheceu" value={f.client?.how_met} />
          <Field label="Nome da mamãe" value={f.client?.mother_name} />
          <Field label="Nome do papai" value={f.client?.father_name} />
        </div>
      </Section>

      <Section title="Festa">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" value={fmtDate(f.event_date)} />
          <Field label="Dia da semana" value={f.event_weekday_raw} />
          <Field label="Início" value={fmtTime(f.event_start_time)} />
          <Field label="Término" value={fmtTime(f.event_end_time)} />
          <Field label="Nº convidados" value={f.guest_count} />
          <Field label="Aniversariante" value={f.celebrant_name} />
          <Field label="Idade" value={f.celebrant_age} />
          <Field label="Crianças pagam a partir de" value={f.children_pay_from_age} />
          <Field label="Decoração" value={f.decoration} />
          <Field label="Menu Degustação" value={f.tasting_menu} />
          <Field label="Prato Quente" value={f.hot_dish} />
          <Field label="Bolo" value={f.cake} />
          <Field label="Prato Kids" value={f.kids_menu} />
          <Field label="Serviços Adicionais" value={f.additional_services} />
        </div>
        {f.observations && (
          <div className="mt-3">
            <Field label="Observações" value={<span className="whitespace-pre-wrap">{f.observations}</span>} />
          </div>
        )}
      </Section>

      <Section title="Financeiro">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Valor total" value={fmtBRL(f.total_value)} />
          <Field label="Forma de pagamento" value={f.payment_method} />
          <Field label="Parcelamento informado" value={f.installment_count} />
          <Field label="Parcelas geradas" value={f.installments_generated} />
          <Field label="Soma das parcelas" value={fmtBRL(f.installments_sum)} />
          <Field label="Diferença" value={fmtBRL(diff)} />
          <Field label="E-mail contratada" value={f.contracted_company_email} />
        </div>

        {ok && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm px-3 py-2 mb-3">
            Parcelas conferidas.
          </div>
        )}
        {Math.abs(diff) >= 0.01 && (
          <div className="rounded-md bg-orange-50 border border-orange-200 text-orange-900 text-sm px-3 py-2 mb-2">
            Atenção: o valor total da festa é {fmtBRL(f.total_value)}, mas a soma das parcelas é {fmtBRL(f.installments_sum)}. Diferença: {fmtBRL(diff)}.
          </div>
        )}
        {countMismatch && (
          <div className="rounded-md bg-orange-50 border border-orange-200 text-orange-900 text-sm px-3 py-2 mb-2">
            Atenção: a festa informa {f.installment_count} parcelas, mas foram geradas {f.installments_generated} parcelas.
          </div>
        )}

        {f.payment_schedule_raw && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Cronograma bruto</div>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">{f.payment_schedule_raw}</pre>
          </div>
        )}

        {installments.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago?</TableHead>
                  <TableHead>Linha original</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.order_index}</TableCell>
                    <TableCell>{fmtDate(i.due_date)}</TableCell>
                    <TableCell>{fmtBRL(i.amount)}</TableCell>
                    <TableCell>{i.payment_method}</TableCell>
                    <TableCell>{i.payment_status ?? "—"}</TableCell>
                    <TableCell>{i.paid ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={i.raw_line ?? ""}>{i.raw_line ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Debug">
        <Button size="sm" variant="outline" onClick={onTogglePayload}>
          {showPayload ? "Ocultar payload" : "Ver payload de origem"}
        </Button>
        {showPayload && (
          <pre className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded p-2 max-h-96 overflow-auto">
            {JSON.stringify(f.raw_webhook_payload, null, 2)}
          </pre>
        )}
      </Section>
    </>
  );
}
