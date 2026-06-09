import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/contexts/UnitContext";
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
import { Plus, AlertTriangle, Clock, CheckCircle2, Calendar } from "lucide-react";

// ----------- types -----------
type Stage =
  | "em_conversa"
  | "visita_agendada"
  | "visita_realizada"
  | "pre_reserva"
  | "ganho"
  | "perdido";

type Source =
  | "meta"
  | "ga"
  | "indicacao"
  | "veio_em_festa"
  | "offline"
  | "ja_cliente"
  | "recorrencia"
  | "outro";

type LossReason =
  | "preco"
  | "data_indisponivel"
  | "sem_resposta"
  | "fechou_concorrente"
  | "festa_em_casa"
  | "fora_perfil"
  | "desistiu"
  | "outro";

type Slot = "almoco" | "jantar";

type VisitStatus = "agendada" | "realizada" | "no_show" | "remarcada" | "cancelada";

type Opportunity = {
  id: string;
  client_id: string;
  unit_id: string | null;
  celebrant_name: string | null;
  celebrant_age: number | null;
  desired_date: string | null;
  desired_slot: Slot | null;
  guest_estimate: number | null;
  stage: Stage;
  source: Source | null;
  estimated_value: number | null;
  owner_id: string | null;
  notes: string | null;
  loss_reason: LossReason | null;
  lost_from_stage: Stage | null;
  stage_changed_at: string;
  closed_at: string | null;
  pre_reserva_at: string | null;
  pre_reserva_expires_at: string | null;
  first_response_at: string | null;
  created_at: string;
  form_slug: string | null;
  client?: { id: string; full_name: string; phone: string | null; email: string | null } | null;
};

type FormLite = { slug: string; name: string };

type Visit = {
  id: string;
  opportunity_id: string;
  scheduled_at: string;
  status: VisitStatus;
  confirmed: boolean;
  notes: string | null;
};

type ClientLite = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

// ----------- labels -----------
const STAGE_LABELS: Record<Stage, string> = {
  em_conversa: "Em conversa",
  visita_agendada: "Visita agendada",
  visita_realizada: "Visita realizada",
  pre_reserva: "Pré-reserva",
  ganho: "Ganho",
  perdido: "Perdido",
};
const STAGES: Stage[] = [
  "em_conversa",
  "visita_agendada",
  "visita_realizada",
  "pre_reserva",
  "ganho",
  "perdido",
];

const SOURCE_LABELS: Record<Source, string> = {
  meta: "Meta (Instagram/Facebook)",
  ga: "Google Ads",
  indicacao: "Indicação",
  veio_em_festa: "Veio em festa",
  offline: "Off-line",
  ja_cliente: "Já é cliente",
  recorrencia: "Recorrência",
  outro: "Outro",
};

const LOSS_LABELS: Record<LossReason, string> = {
  preco: "Preço",
  data_indisponivel: "Data indisponível",
  sem_resposta: "Sem resposta",
  fechou_concorrente: "Fechou com concorrente",
  festa_em_casa: "Festa em casa",
  fora_perfil: "Fora do perfil",
  desistiu: "Desistiu",
  outro: "Outro",
};

const SLOT_LABELS: Record<Slot, string> = { almoco: "Almoço", jantar: "Jantar" };

const VISIT_LABELS: Record<VisitStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  no_show: "No-show",
  remarcada: "Remarcada",
  cancelada: "Cancelada",
};

// ----------- formatters -----------
const fmtBRL = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n));

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const [y, m, d] = s.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return "—";
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s;
  return dt.toLocaleString("pt-BR");
};

const daysSince = (iso: string | null | undefined) => {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
};

// add N business days (skip Sat=6, Sun=0)
function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

export const Route = createFileRoute("/oportunidades")({
  component: OportunidadesPage,
  validateSearch: (s: Record<string, unknown>) => ({ op: typeof s.op === "string" ? s.op : undefined }),
});

function OportunidadesPage() {
  const { session, user, profile } = useAuth();
  const { unitFilter, units, defaultCreateUnitId, mustChooseUnit, isOwner } = useUnit();
  const search = useSearch({ from: "/oportunidades" });
  const [ops, setOps] = useState<Opportunity[] | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [forms, setForms] = useState<FormLite[]>([]);
  const [formFilter, setFormFilter] = useState<string>("all");
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [showNew, setShowNew] = useState(false);

  const loadAll = useCallback(async () => {
    let oppsQ = supabase
      .from("opportunities")
      .select("*, client:clients(id, full_name, phone, email)")
      .order("created_at", { ascending: false });
    let visitsQ = supabase
      .from("visits")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (unitFilter) {
      oppsQ = oppsQ.eq("unit_id", unitFilter);
      visitsQ = visitsQ.eq("unit_id", unitFilter);
    }
    const { data, error } = await oppsQ;
    if (error) {
      setErr(error.message);
      return;
    }
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      client: Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null,
    })) as Opportunity[];
    setOps(rows);
    setSelected((prev) => (prev ? rows.find((x) => x.id === prev.id) ?? null : null));

    const { data: vs } = await visitsQ;
    setVisits((vs ?? []) as Visit[]);

    const { data: fs } = await supabase.from("forms").select("slug, name");
    setForms((fs ?? []) as FormLite[]);
  }, [unitFilter]);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session, loadAll]);

  // open from ?op=
  useEffect(() => {
    if (!ops || !search.op) return;
    const found = ops.find((o) => o.id === search.op);
    if (found) setSelected(found);
  }, [ops, search.op]);

  // action lists
  const actions = useMemo(() => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 86400000;
    const inTwoDays = now + 2 * 86400000;
    const inOneDay = now + 1 * 86400000;
    const list = ops ?? [];
    const visitsByOp = new Map<string, Visit[]>();
    for (const v of visits) {
      const a = visitsByOp.get(v.opportunity_id) ?? [];
      a.push(v);
      visitsByOp.set(v.opportunity_id, a);
    }
    return {
      conversasParadas: list.filter(
        (o) => o.stage === "em_conversa" && new Date(o.stage_changed_at).getTime() <= twoDaysAgo,
      ),
      visitasConfirmar: visits.filter((v) => {
        const t = new Date(v.scheduled_at).getTime();
        return v.status === "agendada" && !v.confirmed && t >= now && t <= inTwoDays;
      }),
      posVisita: list.filter(
        (o) => o.stage === "visita_realizada" && new Date(o.stage_changed_at).getTime() <= twoDaysAgo,
      ),
      preReservaVencendo: list.filter(
        (o) =>
          o.stage === "pre_reserva" &&
          o.pre_reserva_expires_at &&
          new Date(o.pre_reserva_expires_at).getTime() <= inOneDay,
      ),
      visitsByOp,
    };
  }, [ops, visits]);

  const formsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of forms) m.set(f.slug, f.name);
    return m;
  }, [forms]);

  const formLabel = useCallback(
    (slug: string | null | undefined) =>
      slug ? formsMap.get(slug) ?? slug : "Manual / não identificado",
    [formsMap],
  );

  const filteredOps = useMemo(() => {
    if (!ops) return ops;
    if (formFilter === "all") return ops;
    if (formFilter === "__none") return ops.filter((o) => !o.form_slug);
    return ops.filter((o) => o.form_slug === formFilter);
  }, [ops, formFilter]);

  const opsByStage = useMemo(() => {
    const map = new Map<Stage, Opportunity[]>();
    STAGES.forEach((s) => map.set(s, []));
    for (const o of filteredOps ?? []) map.get(o.stage)!.push(o);
    return map;
  }, [filteredOps]);

  const openOp = (id: string) => {
    const o = (ops ?? []).find((x) => x.id === id);
    if (o) setSelected(o);
  };

  return (
    <AppLayout title="Oportunidades">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-slate-500">
          {filteredOps
            ? `${filteredOps.length} oportunidade${filteredOps.length === 1 ? "" : "s"}`
            : "Carregando…"}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-slate-500">Formulário:</Label>
          <Select value={formFilter} onValueChange={setFormFilter}>
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="__none">Manual / não identificado</SelectItem>
              {forms.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Nova oportunidade
          </Button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600 mb-4">Erro: {err}</div>}

      {/* Action lists */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <ActionGroup
          title="Conversas paradas"
          subtitle="Sem mexer há 2+ dias"
          icon={<Clock className="w-4 h-4 text-amber-600" />}
          items={actions.conversasParadas.map((o) => ({
            id: o.id,
            primary: o.client?.full_name ?? "—",
            secondary: `parado há ${daysSince(o.stage_changed_at)}d`,
          }))}
          onClick={openOp}
        />
        <ActionGroup
          title="Visitas a confirmar"
          subtitle="Próximas 48h"
          icon={<Calendar className="w-4 h-4 text-blue-600" />}
          items={actions.visitasConfirmar.map((v) => {
            const o = (ops ?? []).find((x) => x.id === v.opportunity_id);
            return {
              id: v.opportunity_id,
              primary: o?.client?.full_name ?? "—",
              secondary: fmtDateTime(v.scheduled_at),
            };
          })}
          onClick={openOp}
        />
        <ActionGroup
          title="Pós-visita sem decisão"
          subtitle="Há 2+ dias na etapa"
          icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
          items={actions.posVisita.map((o) => ({
            id: o.id,
            primary: o.client?.full_name ?? "—",
            secondary: `há ${daysSince(o.stage_changed_at)}d sem decisão`,
          }))}
          onClick={openOp}
        />
        <ActionGroup
          title="Pré-reservas vencendo"
          subtitle="Em até 24h"
          icon={<CheckCircle2 className="w-4 h-4 text-red-600" />}
          items={actions.preReservaVencendo.map((o) => ({
            id: o.id,
            primary: o.client?.full_name ?? "—",
            secondary: `expira ${fmtDateTime(o.pre_reserva_expires_at)}`,
          }))}
          onClick={openOp}
        />
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 min-h-[400px]">
        {STAGES.map((stage) => (
          <div key={stage} className="bg-slate-100 rounded-lg p-2 flex flex-col">
            <div className="flex items-center justify-between px-2 py-1.5 mb-2">
              <div className="text-xs font-semibold text-slate-700">{STAGE_LABELS[stage]}</div>
              <Badge variant="secondary" className="text-xs">
                {opsByStage.get(stage)?.length ?? 0}
              </Badge>
            </div>
            <div className="space-y-2 flex-1">
              {(opsByStage.get(stage) ?? []).map((o) => (
                <OpCard key={o.id} op={o} formLabel={formLabel} onClick={() => setSelected(o)} />
              ))}
              {(opsByStage.get(stage) ?? []).length === 0 && (
                <div className="text-xs text-slate-400 px-2 py-3 text-center">—</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New opportunity */}
      <NewOpportunityDialog
        open={showNew}
        onOpenChange={setShowNew}
        tenantId={profile?.tenant_id ?? null}
        userId={user?.id ?? null}
        units={units}
        defaultUnitId={defaultCreateUnitId}
        mustChooseUnit={mustChooseUnit}
        onCreated={async () => {
          setShowNew(false);
          await loadAll();
        }}
      />

      {/* Detail (visita usa mesmo unit) */}
      <input type="hidden" data-unit={defaultCreateUnitId ?? ""} />

      {/* Detail */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <OpDetail
              key={selected.id}
              op={selected}
              visits={(actions.visitsByOp.get(selected.id) ?? []).slice().sort(
                (a, b) => a.scheduled_at.localeCompare(b.scheduled_at),
              )}
              tenantId={profile?.tenant_id ?? null}
              userId={user?.id ?? null}
              formLabel={formLabel}
              onChanged={loadAll}
            />
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

// ----------- subcomponents -----------

function ActionGroup({
  title,
  subtitle,
  icon,
  items,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: { id: string; primary: string; secondary: string }[];
  onClick: (id: string) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
      </div>
      <div className="text-xs text-slate-500 mb-2">{subtitle}</div>
      <div className="space-y-1 max-h-44 overflow-y-auto">
        {items.length === 0 && <div className="text-xs text-slate-400">Nada pendente.</div>}
        {items.map((it, i) => (
          <button
            key={`${it.id}-${i}`}
            onClick={() => onClick(it.id)}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-50 border border-slate-100"
          >
            <div className="font-medium text-slate-800 truncate">{it.primary}</div>
            <div className="text-slate-500">{it.secondary}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function OpCard({
  op,
  formLabel,
  onClick,
}: {
  op: Opportunity;
  formLabel: (slug: string | null | undefined) => string;
  onClick: () => void;
}) {
  const parado = daysSince(op.stage_changed_at);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-md p-2.5 hover:border-emerald-400 hover:shadow-sm transition"
    >
      <div className="text-sm font-medium text-slate-900 truncate">
        {op.client?.full_name ?? "—"}
      </div>
      {op.celebrant_name && (
        <div className="text-xs text-slate-600 truncate">
          {op.celebrant_name}
          {op.celebrant_age != null ? ` · ${op.celebrant_age}a` : ""}
        </div>
      )}
      <div className="text-xs text-slate-500 mt-1 space-y-0.5">
        {op.desired_date && <div>Data: {fmtDate(op.desired_date)}</div>}
        {op.source && <div>{SOURCE_LABELS[op.source]}</div>}
        {op.estimated_value != null && <div>{fmtBRL(op.estimated_value)}</div>}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className="text-[10px] font-normal px-1.5 py-0 truncate max-w-[80%]"
          title={formLabel(op.form_slug)}
        >
          {formLabel(op.form_slug)}
        </Badge>
        <span className="text-[10px] text-slate-400 shrink-0">parado há {parado}d</span>
      </div>
    </button>
  );
}


// ----------- New Opportunity dialog -----------
function NewOpportunityDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  units,
  defaultUnitId,
  mustChooseUnit,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  tenantId: string | null;
  userId: string | null;
  units: { id: string; name: string }[];
  defaultUnitId: string | null;
  mustChooseUnit: boolean;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"search" | "create">("search");
  // search
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ClientLite[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  // create new client
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCep, setNewCep] = useState("");
  // opportunity fields
  const [celebrantName, setCelebrantName] = useState("");
  const [celebrantAge, setCelebrantAge] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredSlot, setDesiredSlot] = useState<string>("none");
  const [guestEstimate, setGuestEstimate] = useState("");
  const [source, setSource] = useState<string>("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [chosenUnit, setChosenUnit] = useState<string>(defaultUnitId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChosenUnit(defaultUnitId ?? "");
  }, [defaultUnitId, open]);

  useEffect(() => {
    if (!open) {
      setMode("search");
      setQ("");
      setResults([]);
      setSelectedClient(null);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewCep("");
      setCelebrantName("");
      setCelebrantAge("");
      setDesiredDate("");
      setDesiredSlot("none");
      setGuestEstimate("");
      setSource("");
      setEstimatedValue("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (mode !== "search") return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, phone, email")
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(8);
      setResults((data ?? []) as ClientLite[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  async function handleSave() {
    setError(null);
    if (!tenantId || !userId) {
      setError("Sessão inválida.");
      return;
    }
    if (!source) {
      setError("Selecione a origem.");
      return;
    }
    const unitId = chosenUnit || defaultUnitId;
    if (!unitId) {
      setError("Selecione a unidade.");
      return;
    }
    setSaving(true);
    try {
      let clientId = selectedClient?.id ?? null;
      if (mode === "create") {
        if (!newName.trim() || !newPhone.trim()) {
          setError("Nome e WhatsApp do responsável são obrigatórios.");
          setSaving(false);
          return;
        }
        const { data: c, error: ce } = await supabase
          .from("clients")
          .insert({
            tenant_id: tenantId,
            unit_id: unitId,
            full_name: newName.trim(),
            phone: newPhone.trim(),
            email: newEmail.trim() || null,
            cep: newCep.trim() || null,
            status: "lead",
            created_by: userId,
          })
          .select("id")
          .single();
        if (ce) throw ce;
        clientId = c.id;
      }
      if (!clientId) {
        setError("Selecione um cliente ou crie um novo.");
        setSaving(false);
        return;
      }
      const now = new Date().toISOString();
      const { error: oe } = await supabase.from("opportunities").insert({
        tenant_id: tenantId,
        unit_id: unitId,
        client_id: clientId,
        celebrant_name: celebrantName.trim() || null,
        celebrant_age: celebrantAge ? Number(celebrantAge) : null,
        desired_date: desiredDate || null,
        desired_slot: desiredSlot === "none" ? null : (desiredSlot as Slot),
        guest_estimate: guestEstimate ? Number(guestEstimate) : null,
        source: source as Source,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        owner_id: userId,
        created_by: userId,
        stage: "em_conversa",
        stage_changed_at: now,
        first_response_at: now,
      });
      if (oe) throw oe;
      onCreated();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova oportunidade</DialogTitle>
          <DialogDescription>Cadastre um novo lead/conversa.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div>
            <Label className="mb-2 block">Cliente</Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant={mode === "search" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("search")}
              >
                Buscar existente
              </Button>
              <Button
                type="button"
                variant={mode === "create" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("create")}
              >
                Criar novo
              </Button>
            </div>

            {mode === "search" ? (
              <div>
                <Input
                  placeholder="Buscar por nome ou telefone…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {selectedClient ? (
                  <div className="mt-2 p-2 border rounded bg-emerald-50 text-sm">
                    <div className="font-medium">{selectedClient.full_name}</div>
                    <div className="text-xs text-slate-600">{selectedClient.phone ?? "—"}</div>
                    <button
                      className="text-xs text-blue-600 mt-1"
                      onClick={() => setSelectedClient(null)}
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  results.length > 0 && (
                    <div className="mt-2 border rounded max-h-40 overflow-y-auto">
                      {results.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 border-b last:border-0"
                          onClick={() => setSelectedClient(c)}
                        >
                          <div className="font-medium">{c.full_name}</div>
                          <div className="text-xs text-slate-500">{c.phone ?? "—"}</div>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Nome do responsável *</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp *</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">E-mail</Label>
                  <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">CEP</Label>
                  <Input value={newCep} onChange={(e) => setNewCep(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Festa */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Aniversariante</Label>
              <Input value={celebrantName} onChange={(e) => setCelebrantName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Idade</Label>
              <Input
                type="number"
                value={celebrantAge}
                onChange={(e) => setCelebrantAge(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data desejada</Label>
              <Input type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Turno</Label>
              <Select value={desiredSlot} onValueChange={setDesiredSlot}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="almoco">Almoço</SelectItem>
                  <SelectItem value="jantar">Jantar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Convidados (estimativa)</Label>
              <Input
                type="number"
                value={guestEstimate}
                onChange={(e) => setGuestEstimate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Valor estimado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Origem *</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {units.length > 1 && (
              <div className="col-span-2">
                <Label className="text-xs">Unidade {mustChooseUnit ? "*" : ""}</Label>
                <Select value={chosenUnit} onValueChange={setChosenUnit}>
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------- Opportunity Detail -----------
function OpDetail({
  op,
  visits,
  tenantId,
  userId,
  formLabel,
  onChanged,
}: {
  op: Opportunity;
  visits: Visit[];
  tenantId: string | null;
  userId: string | null;
  formLabel: (slug: string | null | undefined) => string;
  onChanged: () => void;
}) {
  const [showLoss, setShowLoss] = useState(false);
  const [lossReason, setLossReason] = useState<string>("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [notes, setNotes] = useState(op.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function moveStage(next: Stage, extra: Record<string, any> = {}) {
    setBusy(true);
    const now = new Date().toISOString();
    const patch: Record<string, any> = { stage: next, stage_changed_at: now, ...extra };
    if (next === "ganho" || next === "perdido") patch.closed_at = now;
    if (next === "pre_reserva") {
      patch.pre_reserva_at = now;
      patch.pre_reserva_expires_at = addBusinessDays(new Date(), 3).toISOString();
    }
    const { error } = await supabase.from("opportunities").update(patch as any).eq("id", op.id);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    onChanged();
  }

  async function handleLose() {
    if (!lossReason) {
      alert("Selecione o motivo da perda.");
      return;
    }
    await moveStage("perdido", { loss_reason: lossReason, lost_from_stage: op.stage });
    setShowLoss(false);
    setLossReason("");
  }

  async function handleScheduleVisit() {
    if (!visitDate || !visitTime) {
      alert("Informe data e hora.");
      return;
    }
    if (!tenantId || !userId) return;
    setBusy(true);
    const scheduledAt = new Date(`${visitDate}T${visitTime}:00`).toISOString();
    const { error: ve } = await supabase.from("visits").insert({
      tenant_id: tenantId,
      unit_id: op.unit_id,
      opportunity_id: op.id,
      scheduled_at: scheduledAt,
      status: "agendada",
      confirmed: false,
      created_by: userId,
    });
    if (ve) {
      setBusy(false);
      alert(ve.message);
      return;
    }
    await moveStage("visita_agendada");
    setShowSchedule(false);
    setVisitDate("");
    setVisitTime("");
  }

  async function setVisit(v: Visit, patch: Partial<Visit>) {
    const { error } = await supabase.from("visits").update(patch).eq("id", v.id);
    if (error) {
      alert(error.message);
      return;
    }
    if (patch.status === "realizada") {
      await moveStage("visita_realizada");
    } else {
      onChanged();
    }
  }

  async function saveNotes() {
    const { error } = await supabase
      .from("opportunities")
      .update({ notes: notes || null })
      .eq("id", op.id);
    if (error) {
      alert(error.message);
      return;
    }
    onChanged();
  }

  async function changeStageDirect(next: Stage) {
    if (next === "perdido") {
      setShowLoss(true);
      return;
    }
    await moveStage(next);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {op.client?.full_name ?? "—"}{" "}
          <Badge className="ml-2">{STAGE_LABELS[op.stage]}</Badge>
        </SheetTitle>
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Aniversariante</div>
            <div>{op.celebrant_name ?? "—"}{op.celebrant_age != null ? ` · ${op.celebrant_age}a` : ""}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Data desejada</div>
            <div>{fmtDate(op.desired_date)}{op.desired_slot ? ` · ${SLOT_LABELS[op.desired_slot]}` : ""}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Convidados</div>
            <div>{op.guest_estimate ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Origem</div>
            <div>{op.source ? SOURCE_LABELS[op.source] : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Valor estimado</div>
            <div>{fmtBRL(op.estimated_value)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Parado há</div>
            <div>{daysSince(op.stage_changed_at)} dias</div>
          </div>
          {op.pre_reserva_expires_at && (
            <div className="col-span-2">
              <div className="text-xs text-slate-500">Pré-reserva expira em</div>
              <div>{fmtDateTime(op.pre_reserva_expires_at)}</div>
            </div>
          )}
          {op.loss_reason && (
            <div className="col-span-2">
              <div className="text-xs text-slate-500">Motivo da perda</div>
              <div>{LOSS_LABELS[op.loss_reason]} (perdido de {op.lost_from_stage ? STAGE_LABELS[op.lost_from_stage] : "—"})</div>
            </div>
          )}
        </div>

        {/* Cliente */}
        <div className="border-t pt-3">
          <div className="text-xs text-slate-500">Contato</div>
          <div className="text-sm">{op.client?.phone ?? "—"} · {op.client?.email ?? "—"}</div>
        </div>

        {/* Mudar etapa */}
        <div className="border-t pt-3">
          <Label className="text-xs">Mover para etapa</Label>
          <Select value={op.stage} onValueChange={(v) => changeStageDirect(v as Stage)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ações rápidas */}
        <div className="border-t pt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)} disabled={busy}>
            <Calendar className="w-3.5 h-3.5" /> Agendar visita
          </Button>
          <Button size="sm" variant="outline" onClick={() => moveStage("pre_reserva")} disabled={busy || op.stage === "pre_reserva"}>
            Deixar pré-reserva
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => moveStage("ganho")} disabled={busy || op.stage === "ganho"}>
            Marcar ganho
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setShowLoss(true)} disabled={busy || op.stage === "perdido"}>
            Marcar perdido
          </Button>
        </div>

        {/* Visitas */}
        <div className="border-t pt-3">
          <div className="text-sm font-semibold mb-2">Visitas</div>
          {visits.length === 0 && <div className="text-xs text-slate-500">Nenhuma visita agendada.</div>}
          <div className="space-y-2">
            {visits.map((v) => (
              <div key={v.id} className="border rounded p-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{fmtDateTime(v.scheduled_at)}</div>
                    <div className="text-xs text-slate-500">
                      {VISIT_LABELS[v.status]} · {v.confirmed ? "confirmada" : "não confirmada"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!v.confirmed && v.status === "agendada" && (
                      <Button size="sm" variant="outline" onClick={() => setVisit(v, { confirmed: true })}>
                        Confirmar
                      </Button>
                    )}
                    {v.status === "agendada" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setVisit(v, { status: "realizada" })}>
                          Realizada
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setVisit(v, { status: "no_show" })}>
                          No-show
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notas */}
        <div className="border-t pt-3">
          <Label className="text-xs">Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <Button size="sm" className="mt-2" onClick={saveNotes}>Salvar notas</Button>
        </div>
      </div>

      {/* Loss reason modal */}
      <Dialog open={showLoss} onOpenChange={setShowLoss}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdido</DialogTitle>
            <DialogDescription>Selecione o motivo da perda.</DialogDescription>
          </DialogHeader>
          <Select value={lossReason} onValueChange={setLossReason}>
            <SelectTrigger><SelectValue placeholder="Motivo" /></SelectTrigger>
            <SelectContent>
              {(Object.keys(LOSS_LABELS) as LossReason[]).map((k) => (
                <SelectItem key={k} value={k}>{LOSS_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoss(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleLose}>Confirmar perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule visit modal */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar visita</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancelar</Button>
            <Button onClick={handleScheduleVisit} disabled={busy}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
