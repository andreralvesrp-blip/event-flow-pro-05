import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Trash2, Plus, Pencil, XCircle } from "lucide-react";

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
  manually_edited: boolean | null;
  manually_edited_at: string | null;
  canceled_at: string | null;
  cancellation_reason: string | null;
  cancellation_financial_action: string | null;
  manual_status_override: boolean | null;
  opportunity_id: string | null;
  client: {
    id: string;
    full_name: string;
    cpf: string;
    email: string | null;
    phone: string | null;
    address_full: string | null;
    cep: string | null;
    bairro: string | null;
    cidade: string | null;
    source: string | null;
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
  charge_customer: boolean | null;
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
  const { session, user } = useAuth();
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

  const loadAll = useCallback(async () => {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select(
        `*, client:clients(id, full_name, cpf, email, phone, address_full, cep, bairro, cidade, source, how_met, mother_name, father_name)`,
      )
      .order("created_at", { ascending: false });
    if (error) {
      setErr(error.message);
      return;
    }
    const rows = contracts ?? [];
    const ids = rows.map((r: any) => r.id);
    const sums = new Map<string, { sum: number; count: number }>();
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
    // refresh selected snapshot
    setSelected((prev) => (prev ? result.find((x) => x.id === prev.id) ?? null : null));
  }, []);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session, loadAll]);

  // load installments when a festa is selected
  const loadInstallments = useCallback(async (contractId: string) => {
    const { data } = await supabase
      .from("contract_installments")
      .select("id, order_index, due_date, amount, payment_method, paid, paid_at, payment_status, raw_line, charge_customer")
      .eq("contract_id", contractId)
      .order("order_index", { ascending: true });
    setInstallments((data ?? []) as Installment[]);
  }, []);

  useEffect(() => {
    if (!selected) {
      setInstallments([]);
      setShowPayload(false);
      return;
    }
    loadInstallments(selected.id);
  }, [selected, loadInstallments]);

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

  // top cards — canceladas are excluded from active indicators
  const stats = useMemo(() => {
    const list = festas ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const active = list.filter((f) => f.status !== "cancelado");
    const assinadas = active.filter((f) => f.status === "assinado");
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
            Nenhuma festa encontrada ainda.
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
                  <TableCell>{f.status === "cancelado" ? <span className="text-xs text-slate-400">—</span> : financialBadge(f)}</TableCell>
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
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {selected && (
            <DetailContent
              key={selected.id}
              f={selected}
              installments={installments}
              showPayload={showPayload}
              onTogglePayload={() => setShowPayload((v) => !v)}
              userId={user?.id ?? null}
              onSaved={async () => {
                await loadAll();
                await loadInstallments(selected.id);
              }}
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

const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta (Instagram/Facebook)",
  ga: "Google Ads",
  indicacao: "Indicação",
  veio_em_festa: "Veio em festa",
  offline: "Off-line",
  ja_cliente: "Já é cliente",
  recorrencia: "Recorrência",
  outro: "Outro",
};
function fmtSource(s: string | null | undefined) {
  if (!s) return "—";
  return SOURCE_LABELS[s] ?? s;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-200 pt-4 mt-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ---------- Detail (view + edit) ----------

type EditableContract = Pick<
  Festa,
  | "event_date" | "event_weekday_raw" | "event_start_time" | "event_end_time"
  | "guest_count" | "celebrant_name" | "celebrant_age" | "children_pay_from_age"
  | "decoration" | "tasting_menu" | "hot_dish" | "cake" | "kids_menu"
  | "observations" | "additional_services"
  | "total_value" | "payment_method" | "installment_count"
  | "payment_schedule_raw" | "contracted_company_email"
>;

type EditableInstallment = {
  id?: string;        // optional for new
  _new?: boolean;
  _deleted?: boolean;
  order_index: number;
  due_date: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  charge_customer: boolean;
  paid: boolean;
};

function DetailContent({
  f,
  installments,
  showPayload,
  onTogglePayload,
  onSaved,
  userId,
}: {
  f: Festa;
  installments: Installment[];
  showPayload: boolean;
  onTogglePayload: () => void;
  onSaved: () => Promise<void>;
  userId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [form, setForm] = useState<EditableContract>(() => snapshot(f));
  const [insForm, setInsForm] = useState<EditableInstallment[]>(() =>
    installments.map(installmentToEditable),
  );

  // re-seed when underlying data changes (after save/reload)
  useEffect(() => { setForm(snapshot(f)); }, [f]);
  useEffect(() => { setInsForm(installments.map(installmentToEditable)); }, [installments]);

  const diff = Number(f.total_value ?? 0) - Number(f.installments_sum ?? 0);
  const countMismatch = (f.installment_count ?? 0) !== f.installments_generated;
  const ok = Math.abs(diff) < 0.01 && !countMismatch;
  const isCanceled = f.status === "cancelado";

  // Live preview during editing
  const livePreview = useMemo(() => {
    if (!editing) return null;
    const active = insForm.filter((i) => !i._deleted);
    const sum = active.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const tv = Number(form.total_value ?? 0);
    return {
      sum,
      diff: tv - sum,
      count: active.length,
      countMismatch: (Number(form.installment_count ?? 0) || 0) !== active.length,
    };
  }, [editing, insForm, form.total_value, form.installment_count]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updateBody: Record<string, unknown> = {
        ...form,
        // coerce numeric fields
        total_value: form.total_value === null || form.total_value === undefined || (form.total_value as unknown) === ""
          ? null
          : Number(form.total_value),
        installment_count: form.installment_count === null || form.installment_count === undefined || (form.installment_count as unknown) === ""
          ? null
          : Number(form.installment_count),
        guest_count: form.guest_count ?? null,
        celebrant_age: form.celebrant_age ?? null,
        children_pay_from_age: form.children_pay_from_age ?? null,
        manually_edited: true,
        manually_edited_at: now,
        manually_edited_by: userId,
        updated_at: now,
      };
      const { error: cErr } = await supabase
        .from("contracts")
        .update(updateBody as never)
        .eq("id", f.id);
      if (cErr) throw new Error(cErr.message);

      // installments diff
      const toDelete = insForm.filter((i) => i._deleted && i.id).map((i) => i.id!);
      const toUpdate = insForm.filter((i) => !i._deleted && i.id && !i._new);
      const toInsert = insForm.filter((i) => !i._deleted && (i._new || !i.id));

      if (toDelete.length) {
        const { error: dErr } = await supabase
          .from("contract_installments")
          .delete()
          .in("id", toDelete);
        if (dErr) throw new Error(dErr.message);
      }
      for (const i of toUpdate) {
        const { error: uErr } = await supabase
          .from("contract_installments")
          .update({
            order_index: i.order_index,
            due_date: i.due_date,
            amount: Number(i.amount),
            payment_method: i.payment_method,
            payment_status: i.payment_status,
            charge_customer: i.charge_customer,
            paid: i.paid,
            manually_edited: true,
            manually_edited_at: now,
            manually_edited_by: userId,
          })
          .eq("id", i.id!);
        if (uErr) throw new Error(uErr.message);
      }
      if (toInsert.length) {
        const rows = toInsert.map((i) => ({
          tenant_id: (f as unknown as { tenant_id: string }).tenant_id ?? undefined,
          contract_id: f.id,
          order_index: i.order_index,
          due_date: i.due_date,
          amount: Number(i.amount),
          payment_method: i.payment_method,
          payment_status: i.payment_status,
          charge_customer: i.charge_customer,
          paid: i.paid,
          manually_edited: true,
          manually_edited_at: now,
          manually_edited_by: userId,
        }));
        // tenant_id will be filled by RLS default? No — we need it. Fetch from contract row
        if (!rows[0].tenant_id) {
          const { data: ct } = await supabase
            .from("contracts").select("tenant_id").eq("id", f.id).single();
          if (ct?.tenant_id) for (const r of rows) r.tenant_id = ct.tenant_id;
        }
        const { error: iErr } = await supabase.from("contract_installments").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }

      await onSaved();
      setEditing(false);
    } catch (e) {
      alert(`Erro ao salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Festa — {f.celebrant_name ?? "Sem aniversariante"}
          {f.manually_edited && (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 ml-2">Editada manualmente</Badge>
          )}
        </SheetTitle>
      </SheetHeader>

      {/* Action bar */}
      <div className="flex gap-2 mt-4">
        {!editing && !isCanceled && (
          <>
            <Button size="sm" variant="default" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />Editar festa
            </Button>
            <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
              <XCircle className="w-3.5 h-3.5 mr-1.5" />Cancelar festa
            </Button>
          </>
        )}
        {editing && (
          <>
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => { setEditing(false); setForm(snapshot(f)); setInsForm(installments.map(installmentToEditable)); }}>
              Cancelar edição
            </Button>
          </>
        )}
        {isCanceled && (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Festa cancelada</Badge>
        )}
      </div>

      <Section title="Resumo">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" value={statusBadge(f.status)} />
          <Field label="Status financeiro" value={isCanceled ? "—" : financialBadge(f)} />
          <Field label="Clicksign document key" value={<span className="text-xs font-mono">{f.clicksign_document_key ?? "—"}</span>} />
          <Field label="Criado em" value={fmtDateTime(f.created_at)} />
          <Field label="Finalizado em" value={fmtDateTime(f.finalized_at)} />
          <Field label="Data do contrato" value={fmtDate(f.contract_form_date)} />
          {f.manually_edited && (
            <Field label="Última edição manual" value={fmtDateTime(f.manually_edited_at)} />
          )}
          {f.opportunity_id && (
            <div className="col-span-2">
              <Field
                label="Oportunidade de origem"
                value={
                  <span
                    className="text-sm text-blue-600 underline cursor-not-allowed"
                    title="Tela de oportunidades em breve"
                  >
                    Ver oportunidade de origem →
                  </span>
                }
              />
            </div>
          )}
        </div>
      </Section>

      {isCanceled && (
        <Section title="Cancelamento">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cancelada em" value={fmtDateTime(f.canceled_at)} />
            <Field label="Ação financeira" value={
              f.cancellation_financial_action === "cancel_open_installments"
                ? "Cancelar parcelas em aberto"
                : f.cancellation_financial_action === "keep_installments"
                  ? "Manter parcelas"
                  : f.cancellation_financial_action
            } />
            <div className="col-span-2">
              <Field label="Motivo" value={<span className="whitespace-pre-wrap">{f.cancellation_reason}</span>} />
            </div>
          </div>
        </Section>
      )}

      <Section title="Cliente">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome completo" value={f.client?.full_name} />
          <Field label="CPF" value={fmtCPF(f.client?.cpf)} />
          <Field label="E-mail" value={f.client?.email} />
          <Field label="Celular" value={fmtPhone(f.client?.phone)} />
          <Field label="Bairro" value={f.client?.bairro} />
          <Field label="Cidade" value={f.client?.cidade} />
          <Field label="CEP" value={f.client?.cep} />
          <Field label="Como conheceu" value={fmtSource(f.client?.source)} />
          <Field label="Nome da mamãe" value={f.client?.mother_name} />
          <Field label="Nome do papai" value={f.client?.father_name} />
          {f.client?.address_full && (
            <div className="col-span-2">
              <div className="text-xs text-slate-400">Endereço completo (legado)</div>
              <div className="text-xs text-slate-500 whitespace-pre-wrap">{f.client.address_full}</div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Festa">
        {!editing ? (
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
            {f.observations && (
              <div className="col-span-2">
                <Field label="Observações" value={<span className="whitespace-pre-wrap">{f.observations}</span>} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <EField label="Data" type="date" value={form.event_date ?? ""} onChange={(v) => setForm({ ...form, event_date: v || null })} />
            <EField label="Dia da semana" value={form.event_weekday_raw ?? ""} onChange={(v) => setForm({ ...form, event_weekday_raw: v || null })} />
            <EField label="Início" type="time" value={(form.event_start_time ?? "").slice(0,5)} onChange={(v) => setForm({ ...form, event_start_time: v ? `${v}:00` : null })} />
            <EField label="Término" type="time" value={(form.event_end_time ?? "").slice(0,5)} onChange={(v) => setForm({ ...form, event_end_time: v ? `${v}:00` : null })} />
            <EField label="Nº convidados" type="number" value={form.guest_count ?? ""} onChange={(v) => setForm({ ...form, guest_count: v === "" ? null : Number(v) })} />
            <EField label="Aniversariante" value={form.celebrant_name ?? ""} onChange={(v) => setForm({ ...form, celebrant_name: v || null })} />
            <EField label="Idade" type="number" value={form.celebrant_age ?? ""} onChange={(v) => setForm({ ...form, celebrant_age: v === "" ? null : Number(v) })} />
            <EField label="Crianças pagam a partir de" type="number" value={form.children_pay_from_age ?? ""} onChange={(v) => setForm({ ...form, children_pay_from_age: v === "" ? null : Number(v) })} />
            <ETextarea label="Decoração" value={form.decoration ?? ""} onChange={(v) => setForm({ ...form, decoration: v || null })} />
            <ETextarea label="Menu Degustação" value={form.tasting_menu ?? ""} onChange={(v) => setForm({ ...form, tasting_menu: v || null })} />
            <ETextarea label="Prato Quente" value={form.hot_dish ?? ""} onChange={(v) => setForm({ ...form, hot_dish: v || null })} />
            <ETextarea label="Bolo" value={form.cake ?? ""} onChange={(v) => setForm({ ...form, cake: v || null })} />
            <ETextarea label="Prato Kids" value={form.kids_menu ?? ""} onChange={(v) => setForm({ ...form, kids_menu: v || null })} />
            <ETextarea label="Serviços Adicionais" value={form.additional_services ?? ""} onChange={(v) => setForm({ ...form, additional_services: v || null })} />
            <div className="col-span-2">
              <ETextarea label="Observações" value={form.observations ?? ""} onChange={(v) => setForm({ ...form, observations: v || null })} />
            </div>
          </div>
        )}
      </Section>

      <Section title="Financeiro">
        {!editing ? (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Valor total" value={fmtBRL(f.total_value)} />
            <Field label="Forma de pagamento" value={f.payment_method} />
            <Field label="Parcelamento informado" value={f.installment_count} />
            <Field label="Parcelas geradas" value={f.installments_generated} />
            <Field label="Soma das parcelas" value={fmtBRL(f.installments_sum)} />
            <Field label="Diferença" value={fmtBRL(diff)} />
            <Field label="E-mail contratada" value={f.contracted_company_email} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <EField label="Valor total (R$)" type="number" step="0.01" value={form.total_value ?? ""} onChange={(v) => setForm({ ...form, total_value: v === "" ? null : Number(v) })} />
            <EField label="Forma de pagamento" value={form.payment_method ?? ""} onChange={(v) => setForm({ ...form, payment_method: v || null })} />
            <EField label="Parcelamento informado" type="number" value={form.installment_count ?? ""} onChange={(v) => setForm({ ...form, installment_count: v === "" ? null : Number(v) })} />
            <EField label="E-mail contratada" value={form.contracted_company_email ?? ""} onChange={(v) => setForm({ ...form, contracted_company_email: v || null })} />
            <div className="col-span-2">
              <ETextarea label="Cronograma bruto (informativo)" value={form.payment_schedule_raw ?? ""} onChange={(v) => setForm({ ...form, payment_schedule_raw: v || null })} />
            </div>
          </div>
        )}

        {!editing && !isCanceled && ok && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm px-3 py-2 mb-3">
            Parcelas conferidas.
          </div>
        )}
        {!editing && !isCanceled && Math.abs(diff) >= 0.01 && (
          <div className="rounded-md bg-orange-50 border border-orange-200 text-orange-900 text-sm px-3 py-2 mb-2">
            Atenção: o valor total da festa é {fmtBRL(f.total_value)}, mas a soma das parcelas é {fmtBRL(f.installments_sum)}. Diferença: {fmtBRL(diff)}.
          </div>
        )}
        {!editing && !isCanceled && countMismatch && (
          <div className="rounded-md bg-orange-50 border border-orange-200 text-orange-900 text-sm px-3 py-2 mb-2">
            Atenção: a festa informa {f.installment_count} parcelas, mas foram geradas {f.installments_generated} parcelas.
          </div>
        )}

        {editing && livePreview && (
          <div className={`rounded-md border text-sm px-3 py-2 mb-3 ${
            Math.abs(livePreview.diff) < 0.01 && !livePreview.countMismatch
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-orange-50 border-orange-200 text-orange-900"
          }`}>
            Prévia: soma das parcelas {fmtBRL(livePreview.sum)} · diferença {fmtBRL(livePreview.diff)} · {livePreview.count} parcelas
            {livePreview.countMismatch ? ` (informado: ${form.installment_count ?? "—"})` : ""}
          </div>
        )}

        {/* Installments editor */}
        <div className="mt-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cobrar</TableHead>
                <TableHead>Pago?</TableHead>
                {editing && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(editing ? insForm : installments.map(installmentToEditable))
                .filter((i) => !i._deleted)
                .map((i, idx) => (
                  <TableRow key={i.id ?? `new-${idx}`}>
                    <TableCell>{editing
                      ? <Input className="h-8 w-14" type="number" value={i.order_index} onChange={(e) => updateInsAt(setInsForm, idx, { order_index: Number(e.target.value) })} />
                      : i.order_index}</TableCell>
                    <TableCell>{editing
                      ? <Input className="h-8" type="date" value={i.due_date ?? ""} onChange={(e) => updateInsAt(setInsForm, idx, { due_date: e.target.value })} />
                      : fmtDate(i.due_date)}</TableCell>
                    <TableCell>{editing
                      ? <Input className="h-8 w-28" type="number" step="0.01" value={i.amount} onChange={(e) => updateInsAt(setInsForm, idx, { amount: Number(e.target.value) })} />
                      : fmtBRL(i.amount)}</TableCell>
                    <TableCell>{editing
                      ? <Input className="h-8 w-28" value={i.payment_method} onChange={(e) => updateInsAt(setInsForm, idx, { payment_method: e.target.value })} />
                      : i.payment_method}</TableCell>
                    <TableCell>{editing ? (
                      <Select value={i.payment_status} onValueChange={(v) => updateInsAt(setInsForm, idx, { payment_status: v })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="pago">Pago</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                          <SelectItem value="atrasado">Atrasado</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (i.payment_status ?? "—")}</TableCell>
                    <TableCell>{editing
                      ? <input type="checkbox" checked={!!i.charge_customer} onChange={(e) => updateInsAt(setInsForm, idx, { charge_customer: e.target.checked })} />
                      : (i.charge_customer ? "Sim" : "Não")}</TableCell>
                    <TableCell>{editing
                      ? <input type="checkbox" checked={!!i.paid} onChange={(e) => updateInsAt(setInsForm, idx, { paid: e.target.checked })} />
                      : (i.paid ? "Sim" : "Não")}</TableCell>
                    {editing && (
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeInsAt(setInsForm, idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {editing && (
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => addIns(setInsForm)}>
                <Plus className="w-3.5 h-3.5 mr-1" />Adicionar parcela
              </Button>
            </div>
          )}
        </div>
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

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        contractId={f.id}
        userId={userId}
        onDone={async () => { setCancelOpen(false); await onSaved(); }}
      />
    </>
  );
}

// ---------- helpers ----------
function snapshot(f: Festa): EditableContract {
  return {
    event_date: f.event_date,
    event_weekday_raw: f.event_weekday_raw,
    event_start_time: f.event_start_time,
    event_end_time: f.event_end_time,
    guest_count: f.guest_count,
    celebrant_name: f.celebrant_name,
    celebrant_age: f.celebrant_age,
    children_pay_from_age: f.children_pay_from_age,
    decoration: f.decoration,
    tasting_menu: f.tasting_menu,
    hot_dish: f.hot_dish,
    cake: f.cake,
    kids_menu: f.kids_menu,
    observations: f.observations,
    additional_services: f.additional_services,
    total_value: f.total_value,
    payment_method: f.payment_method,
    installment_count: f.installment_count,
    payment_schedule_raw: f.payment_schedule_raw,
    contracted_company_email: f.contracted_company_email,
  };
}
function installmentToEditable(i: Installment): EditableInstallment {
  return {
    id: i.id,
    order_index: i.order_index,
    due_date: i.due_date,
    amount: Number(i.amount),
    payment_method: i.payment_method,
    payment_status: i.payment_status ?? "pendente",
    charge_customer: i.charge_customer ?? true,
    paid: i.paid,
  };
}
function updateInsAt(
  setter: React.Dispatch<React.SetStateAction<EditableInstallment[]>>,
  visibleIdx: number,
  patch: Partial<EditableInstallment>,
) {
  setter((prev) => {
    const visible = prev.map((p, i) => ({ p, i })).filter(({ p }) => !p._deleted);
    const target = visible[visibleIdx];
    if (!target) return prev;
    const copy = [...prev];
    copy[target.i] = { ...copy[target.i], ...patch };
    return copy;
  });
}
function removeInsAt(
  setter: React.Dispatch<React.SetStateAction<EditableInstallment[]>>,
  visibleIdx: number,
) {
  setter((prev) => {
    const visible = prev.map((p, i) => ({ p, i })).filter(({ p }) => !p._deleted);
    const target = visible[visibleIdx];
    if (!target) return prev;
    const copy = [...prev];
    if (copy[target.i]._new) {
      copy.splice(target.i, 1);
    } else {
      copy[target.i] = { ...copy[target.i], _deleted: true };
    }
    return copy;
  });
}
function addIns(setter: React.Dispatch<React.SetStateAction<EditableInstallment[]>>) {
  setter((prev) => {
    const active = prev.filter((p) => !p._deleted);
    const nextIdx = active.length ? Math.max(...active.map((p) => p.order_index)) + 1 : 1;
    return [
      ...prev,
      {
        _new: true,
        order_index: nextIdx,
        due_date: new Date().toISOString().slice(0, 10),
        amount: 0,
        payment_method: "PIX",
        payment_status: "pendente",
        charge_customer: true,
        paid: false,
      },
    ];
  });
}

function EField({
  label, value, onChange, type = "text", step,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        className="h-9 mt-1"
        type={type}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function ETextarea({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <Textarea
        className="mt-1 min-h-[60px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------- Cancel Dialog ----------
function CancelDialog({
  open, onOpenChange, contractId, userId, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contractId: string;
  userId: string | null;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"cancel_open_installments" | "keep_installments" | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setReason(""); setAction(""); } }, [open]);

  async function confirm() {
    if (!reason.trim() || !action || !userId) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error: cErr } = await supabase
        .from("contracts")
        .update({
          status: "cancelado",
          canceled_at: now,
          canceled_by: userId,
          cancellation_reason: reason.trim(),
          cancellation_financial_action: action,
          manual_status_override: true,
          manually_edited: true,
          manually_edited_at: now,
          manually_edited_by: userId,
          updated_at: now,
        })
        .eq("id", contractId);
      if (cErr) throw new Error(cErr.message);

      if (action === "cancel_open_installments") {
        const { error: iErr } = await supabase
          .from("contract_installments")
          .update({
            payment_status: "cancelado",
            manually_edited: true,
            manually_edited_at: now,
            manually_edited_by: userId,
          })
          .eq("contract_id", contractId)
          .eq("paid", false);
        if (iErr) throw new Error(iErr.message);
      }
      await onDone();
    } catch (e) {
      alert(`Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar festa</DialogTitle>
          <DialogDescription>
            Essa ação não apaga o histórico, mas remove a festa dos indicadores ativos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Motivo do cancelamento</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo…"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs mb-2 block">O que fazer com parcelas em aberto?</Label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="finact"
                  className="mt-1"
                  checked={action === "cancel_open_installments"}
                  onChange={() => setAction("cancel_open_installments")}
                />
                <div className="text-sm">
                  <div className="font-medium">Cancelar parcelas em aberto</div>
                  <div className="text-xs text-slate-500">Parcelas pagas são preservadas.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="finact"
                  className="mt-1"
                  checked={action === "keep_installments"}
                  onChange={() => setAction("keep_installments")}
                />
                <div className="text-sm">
                  <div className="font-medium">Manter parcelas para tratativa financeira</div>
                  <div className="text-xs text-slate-500">As parcelas continuam pendentes para acompanhamento.</div>
                </div>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button
            disabled={busy || !reason.trim() || !action}
            onClick={confirm}
            className="bg-red-600 hover:bg-red-700"
          >
            {busy ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
