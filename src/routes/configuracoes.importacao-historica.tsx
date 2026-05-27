import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Upload, AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/configuracoes/importacao-historica")({
  component: ImportPage,
});

type Batch = {
  id: string;
  source_file_name: string | null;
  status: string;
  total_clients: number | null;
  total_festas: number | null;
  total_parcelas: number | null;
  total_revisao: number | null;
  diagnostic: any;
  created_at: string;
  committed_at: string | null;
};

const CONTRACTED_EMAIL = "andre@buffetkidspoint.com.br";

// helpers ----------------------------------------------------------
const toStr = (v: any) => (v === undefined || v === null || v === "" ? null : String(v).trim());
const toBool = (v: any) => v === true || v === "true" || v === 1 || v === "1" || String(v).toLowerCase() === "true";
const toInt = (v: any) => {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
};
const toNum = (v: any) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};
// Excel serial date → JS date (1900 system)
const excelToDate = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const excelToTime = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const total = Math.round(v * 86400);
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}:00`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:00` : null;
};

// Detecta linhas que NÃO são parcela e sim dados bancários / CNPJ / conta
// devolvidos pela aba "parcelas" da planilha canônica.
const BANK_INFO_REGEX = new RegExp(
  [
    "cnpj", "\\bcpf\\b", "banco", "ag[eê]ncia", "\\bconta\\b", "favorecid",
    "dados\\s+para\\s+transfer", "chave\\s*pix", "pix\\s*cnpj",
    "0001-", "agencia:", "conta:",
  ].join("|"),
  "i",
);

// Valor de parcela "absurdo" = provavelmente CNPJ/conta colado na coluna amount.
// Parcelas de buffet infantil dificilmente passam de R$ 200k.
const ABSURD_AMOUNT_THRESHOLD = 200_000;

function classifyParcela(rawLine: string | null, amount: number | null): {
  isBankInfo: boolean;
  reason: string | null;
} {
  const txt = (rawLine || "").trim();
  if (txt && BANK_INFO_REGEX.test(txt)) {
    return { isBankInfo: true, reason: `raw_line contém padrão bancário: "${txt.slice(0, 120)}"` };
  }
  if (amount !== null && amount >= ABSURD_AMOUNT_THRESHOLD) {
    return { isBankInfo: true, reason: `valor absurdo (${amount}) — provável CNPJ/conta` };
  }
  return { isBankInfo: false, reason: null };
}

const CHUNK = 200;
async function insertChunked(table: any, rows: any[]) {
  const tableAny = supabase.from(table) as any;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await tableAny.insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function ImportPage() {
  const { session, profile } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Batch | null>(null);
  const [diag, setDiag] = useState<any>(null);

  const loadBatches = useCallback(async () => {
    const { data, error } = await supabase
      .from("legacy_import_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setBatches((data as Batch[]) || []);
  }, []);

  useEffect(() => {
    if (session) loadBatches();
  }, [session, loadBatches]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;
    setBusy("Lendo planilha...");
    setErr(null);
    setMsg(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });

      const get = (name: string) =>
        wb.SheetNames.includes(name) ? XLSX.utils.sheet_to_json<any>(wb.Sheets[name], { defval: null }) : [];

      const clientes = get("clientes");
      const festas = get("festas");
      const parcelas = get("parcelas");
      const revisao = get("revisao");

      if (!clientes.length || !festas.length) {
        throw new Error("Planilha sem abas clientes/festas. Verifique o arquivo.");
      }

      setBusy("Criando lote de importação...");
      const { data: batch, error: bErr } = await supabase
        .from("legacy_import_batches")
        .insert({
          tenant_id: profile.tenant_id,
          source_file_name: file.name,
          status: "staged",
          total_clients: clientes.length,
          total_festas: festas.length,
          total_parcelas: parcelas.length,
          total_revisao: revisao.length,
          created_by: profile.id,
        })
        .select()
        .single();
      if (bErr || !batch) throw new Error(bErr?.message || "Falha ao criar lote");

      const batchId = batch.id;
      const tenantId = profile.tenant_id;

      // Stage clients
      setBusy(`Carregando ${clientes.length} clientes em staging...`);
      const cRows = clientes.map((r) => ({
        import_batch_id: batchId,
        tenant_id: tenantId,
        legacy_client_key: toStr(r.legacy_client_key),
        full_name: toStr(r.full_name),
        document_type: toStr(r.document_type) || "CPF",
        document_number: toStr(r.document_number),
        legacy_document_raw: toStr(r.legacy_document_raw),
        email: toStr(r.email),
        phone: toStr(r.phone),
        address_full: toStr(r.address_full),
        mother_name: toStr(r.mother_name),
        father_name: toStr(r.father_name),
        how_met: toStr(r.how_met),
        notes: toStr(r.notes),
        needs_review: toBool(r.needs_review),
        warnings: toStr(r.warnings),
        raw_row: r,
      }));
      await insertChunked("legacy_import_clients", cRows);

      // Stage festas
      setBusy(`Carregando ${festas.length} festas em staging...`);
      const fRows = festas.map((r) => ({
        import_batch_id: batchId,
        tenant_id: tenantId,
        legacy_contract_key: toStr(r.legacy_contract_key),
        legacy_client_key: toStr(r.legacy_client_key),
        status: toStr(r.status) || "assinado",
        event_date: excelToDate(r.event_date),
        event_weekday_raw: toStr(r.event_weekday_raw),
        event_start_time: excelToTime(r.event_start_time),
        event_end_time: excelToTime(r.event_end_time),
        guest_count: toInt(r.guest_count),
        celebrant_name: toStr(r.celebrant_name),
        celebrant_age: toInt(r.celebrant_age),
        children_pay_from_age: toInt(r.children_pay_from_age),
        decoration: toStr(r.decoration),
        tasting_menu: toStr(r.tasting_menu),
        hot_dish: toStr(r.hot_dish),
        cake: toStr(r.cake),
        kids_menu: toStr(r.kids_menu),
        observations: toStr(r.observations),
        additional_services: toStr(r.additional_services),
        total_value: toNum(r.total_value),
        payment_method: toStr(r.payment_method),
        installment_count: toInt(r.installment_count),
        payment_schedule_raw: toStr(r.payment_schedule_raw),
        contract_form_date: excelToDate(r.contract_form_date),
        contracted_company_email: toStr(r.contracted_company_email),
        is_historical: toBool(r.is_historical),
        financial_scope: toStr(r.financial_scope),
        needs_review: toBool(r.needs_review),
        legacy_notes: toStr(r.legacy_notes),
        warnings: toStr(r.warnings),
        raw_row: r,
      }));
      await insertChunked("legacy_import_festas", fRows);

      // Stage parcelas
      setBusy(`Carregando ${parcelas.length} parcelas em staging...`);
      const pRows = parcelas.map((r) => ({
        import_batch_id: batchId,
        tenant_id: tenantId,
        legacy_contract_key: toStr(r.legacy_contract_key),
        order_index: toInt(r.order_index),
        due_date: excelToDate(r.due_date),
        amount: toNum(r.amount),
        payment_method: toStr(r.payment_method) || "PIX",
        payment_status: toStr(r.payment_status),
        paid: toBool(r.paid),
        paid_at: r.paid_at ? new Date(r.paid_at).toISOString() : null,
        charge_customer: r.charge_customer === null ? null : toBool(r.charge_customer),
        card_installments: toInt(r.card_installments),
        raw_line: toStr(r.raw_line),
        is_historical: toBool(r.is_historical),
        financial_scope: toStr(r.financial_scope),
        needs_review: toBool(r.needs_review),
        warnings: toStr(r.warnings),
        raw_row: r,
      }));
      await insertChunked("legacy_import_parcelas", pRows);

      // Stage revisao
      if (revisao.length) {
        setBusy(`Carregando ${revisao.length} revisões...`);
        const rRows = revisao.map((r) => ({
          import_batch_id: batchId,
          tenant_id: tenantId,
          origem: toStr(r.origem),
          source_row_number: toInt(r.source_row_number),
          legacy_client_key: toStr(r.legacy_client_key),
          legacy_contract_key: toStr(r.legacy_contract_key),
          tipo_problema: toStr(r.tipo_problema),
          campo: toStr(r.campo),
          valor_original: toStr(r.valor_original),
          valor_normalizado: toStr(r.valor_normalizado),
          severidade: toStr(r.severidade),
          acao_recomendada: toStr(r.acao_recomendada),
          observacao: toStr(r.observacao),
          raw_row: r,
        }));
        await insertChunked("legacy_import_revisao", rRows);
      }

      setBusy("Calculando diagnóstico...");
      await computeDiagnostic(batchId);
      setMsg(`Lote ${batchId.slice(0, 8)} criado em staging.`);
      await loadBatches();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function computeDiagnostic(batchId: string) {
    const sb: any = supabase;
    // Get staging summaries
    const [cs, fs, ps, rv] = await Promise.all([
      sb.from("legacy_import_clients").select("document_type, document_number, email, phone").eq("import_batch_id", batchId),
      sb.from("legacy_import_festas").select("legacy_contract_key, financial_scope, needs_review, total_value, status").eq("import_batch_id", batchId),
      sb.from("legacy_import_parcelas").select("financial_scope, amount, paid").eq("import_batch_id", batchId),
      sb.from("legacy_import_revisao").select("severidade").eq("import_batch_id", batchId),
    ]);

    const clientesStg = cs.data || [];
    const festasStg = fs.data || [];
    const parcelasStg = ps.data || [];
    const revStg = rv.data || [];

    // Existing match counts
    const docs = Array.from(new Set(clientesStg.map((c: any) => c.document_number).filter(Boolean)));
    let existingDocs = 0;
    if (docs.length) {
      const { data: existing } = await sb
        .from("clients")
        .select("document_number")
        .in("document_number", docs);
      existingDocs = (existing || []).length;
    }

    const keys = Array.from(new Set(festasStg.map((f: any) => f.legacy_contract_key).filter(Boolean)));
    let existingContracts = 0;
    if (keys.length) {
      const { data: existing } = await sb
        .from("contracts")
        .select("legacy_contract_key")
        .in("legacy_contract_key", keys);
      existingContracts = (existing || []).length;
    }

    const diagnostic = {
      clientes_total: clientesStg.length,
      clientes_cpf: clientesStg.filter((c: any) => c.document_type === "CPF").length,
      clientes_cnpj: clientesStg.filter((c: any) => c.document_type === "CNPJ").length,
      clientes_com_email: clientesStg.filter((c: any) => c.email).length,
      clientes_ja_existem: existingDocs,
      clientes_serao_criados: clientesStg.length - existingDocs,
      festas_total: festasStg.length,
      festas_historicas: festasStg.filter((f: any) => f.financial_scope === "historico").length,
      festas_ativas: festasStg.filter((f: any) => f.financial_scope === "ativo").length,
      festas_needs_review: festasStg.filter((f: any) => f.needs_review).length,
      festas_ja_existem: existingContracts,
      festas_serao_criadas: festasStg.length - existingContracts,
      parcelas_total: parcelasStg.length,
      parcelas_historicas: parcelasStg.filter((p: any) => p.financial_scope === "historico").length,
      parcelas_ativas: parcelasStg.filter((p: any) => p.financial_scope === "ativo").length,
      revisao_total: revStg.length,
      revisao_alta: revStg.filter((r: any) => r.severidade === "alta").length,
      revisao_media: revStg.filter((r: any) => r.severidade === "media").length,
      revisao_baixa: revStg.filter((r: any) => r.severidade === "baixa").length,
      receita_ativa: festasStg.filter((f: any) => f.financial_scope === "ativo").reduce((s: number, f: any) => s + Number(f.total_value || 0), 0),
      receita_historica: festasStg.filter((f: any) => f.financial_scope === "historico").reduce((s: number, f: any) => s + Number(f.total_value || 0), 0),
    };

    await sb.from("legacy_import_batches").update({ diagnostic }).eq("id", batchId);
    setDiag(diagnostic);
  }

  async function openBatch(b: Batch) {
    setActive(b);
    setDiag(b.diagnostic);
    if (!b.diagnostic) await computeDiagnostic(b.id);
  }

  async function commitBatch(batch: Batch) {
    if (!profile) return;
    if (!confirm("Esta ação irá criar festas históricas e futuras no sistema. Festas históricas não serão tratadas como cobrança ativa. Confirmar?")) return;
    setBusy("Confirmando importação...");
    setErr(null);
    try {
      await runCommit(batch.id, profile.tenant_id, profile.id);
      setMsg(`Lote ${batch.id.slice(0, 8)} commitado.`);
      await loadBatches();
      const { data: refreshed } = await supabase.from("legacy_import_batches").select("*").eq("id", batch.id).single();
      if (refreshed) setActive(refreshed as Batch);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppLayout title="Importação histórica">
      <div className="max-w-5xl space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900">Carregar planilha canônica</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Sobe os dados em staging. Nada é gravado em festas/clientes até você confirmar o commit.
              </p>
            </div>
            <label className="inline-flex">
              <input type="file" accept=".xlsx" className="hidden" onChange={handleFile} disabled={!!busy} />
              <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer ${busy ? "bg-slate-200 text-slate-500" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}>
                <Upload className="w-4 h-4" /> Selecionar .xlsx
              </span>
            </label>
          </div>
          {busy && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {busy}
            </div>
          )}
          {err && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> {err}
            </div>
          )}
          {msg && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> {msg}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Lotes de importação</h3>
            <button onClick={loadBatches} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Atualizar
            </button>
          </div>
          {batches.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Nenhum lote ainda.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Data</th>
                  <th className="text-left px-4 py-2 font-medium">Arquivo</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Clientes</th>
                  <th className="text-right px-4 py-2 font-medium">Festas</th>
                  <th className="text-right px-4 py-2 font-medium">Parcelas</th>
                  <th className="text-right px-4 py-2 font-medium">Revisão</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-xs text-slate-600">{new Date(b.created_at).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-xs">{b.source_file_name}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${b.status === "committed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs">{b.total_clients}</td>
                    <td className="px-4 py-2 text-right text-xs">{b.total_festas}</td>
                    <td className="px-4 py-2 text-right text-xs">{b.total_parcelas}</td>
                    <td className="px-4 py-2 text-right text-xs">{b.total_revisao}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => openBatch(b)}>Abrir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {active && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Diagnóstico do lote {active.id.slice(0, 8)}</h3>
                <p className="text-xs text-slate-500">{active.source_file_name} · {active.status}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => computeDiagnostic(active.id)}>Recalcular</Button>
                {active.status !== "committed" && (
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => commitBatch(active)} disabled={!!busy}>
                    Confirmar importação
                  </Button>
                )}
              </div>
            </div>
            {!diag ? (
              <div className="text-xs text-slate-500">Sem diagnóstico ainda.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Stat label="Clientes — total" value={diag.clientes_total} />
                <Stat label="Clientes CPF" value={diag.clientes_cpf} />
                <Stat label="Clientes CNPJ" value={diag.clientes_cnpj} />
                <Stat label="Já existem no sistema" value={diag.clientes_ja_existem} />
                <Stat label="Serão criados" value={diag.clientes_serao_criados} highlight />
                <Stat label="Festas — total" value={diag.festas_total} />
                <Stat label="Festas históricas" value={diag.festas_historicas} />
                <Stat label="Festas ativas (futuras)" value={diag.festas_ativas} />
                <Stat label="Festas needs_review" value={diag.festas_needs_review} />
                <Stat label="Festas já existem" value={diag.festas_ja_existem} />
                <Stat label="Festas serão criadas" value={diag.festas_serao_criadas} highlight />
                <Stat label="Parcelas — total" value={diag.parcelas_total} />
                <Stat label="Parcelas históricas" value={diag.parcelas_historicas} />
                <Stat label="Parcelas ativas" value={diag.parcelas_ativas} />
                <Stat label="Revisão — alta" value={diag.revisao_alta} />
                <Stat label="Revisão — média" value={diag.revisao_media} />
                <Stat label="Revisão — baixa" value={diag.revisao_baixa} />
                <Stat label="Receita ativa (futura)" value={fmtBRL(diag.receita_ativa)} />
                <Stat label="Receita histórica" value={fmtBRL(diag.receita_historica)} />
              </div>
            )}
            {active.status !== "committed" && (
              <div className="mt-4 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                Esta ação irá criar festas históricas e futuras no sistema. Festas históricas não serão tratadas como cobrança ativa.
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`border rounded p-3 ${highlight ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-900 mt-1">{value ?? "—"}</div>
    </div>
  );
}

function fmtBRL(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// =====================================================================
// COMMIT: staging -> final
// =====================================================================
async function runCommit(batchId: string, tenantId: string, userId: string) {
  const sb: any = supabase;

  // 1) Clients
  const { data: stClients, error: e1 } = await sb
    .from("legacy_import_clients").select("*").eq("import_batch_id", batchId);
  if (e1) throw new Error("clients staging: " + e1.message);

  const clientKeyMap = new Map<string, string>(); // legacy_client_key -> client.id

  for (const sc of stClients || []) {
    let existingId: string | null = null;

    // Try by document_number
    if (sc.document_number) {
      const { data: byDoc } = await sb
        .from("clients").select("id, email, phone, address_full, mother_name, father_name, how_met")
        .eq("tenant_id", tenantId)
        .eq("document_number", sc.document_number)
        .maybeSingle();
      if (byDoc) existingId = byDoc.id;
    }
    // by cpf legacy column
    if (!existingId && sc.document_type === "CPF" && sc.document_number) {
      const { data: byCpf } = await sb
        .from("clients").select("id").eq("tenant_id", tenantId).eq("cpf", sc.document_number).maybeSingle();
      if (byCpf) existingId = byCpf.id;
    }
    // by email
    if (!existingId && sc.email && sc.email !== CONTRACTED_EMAIL) {
      const { data: byEm } = await sb.from("clients").select("id").eq("tenant_id", tenantId).eq("email", sc.email).maybeSingle();
      if (byEm) existingId = byEm.id;
    }
    // by phone
    if (!existingId && sc.phone) {
      const { data: byPh } = await sb.from("clients").select("id").eq("tenant_id", tenantId).eq("phone", sc.phone).maybeSingle();
      if (byPh) existingId = byPh.id;
    }

    const payload: any = {
      tenant_id: tenantId,
      full_name: sc.full_name,
      document_type: sc.document_type || "CPF",
      document_number: sc.document_number,
      legacy_document_raw: sc.legacy_document_raw,
      cpf: sc.document_type === "CPF" ? sc.document_number : null,
      email: sc.email && sc.email !== CONTRACTED_EMAIL ? sc.email : null,
      phone: sc.phone,
      address_full: sc.address_full,
      mother_name: sc.mother_name,
      father_name: sc.father_name,
      how_met: sc.how_met,
      notes: sc.notes,
    };

    let createdId: string;
    if (existingId) {
      // do not overwrite good data with empty
      const cleanUpdate: any = {};
      for (const k of Object.keys(payload)) {
        if (payload[k] !== null && payload[k] !== undefined && payload[k] !== "") cleanUpdate[k] = payload[k];
      }
      const { error } = await sb.from("clients").update(cleanUpdate).eq("id", existingId);
      if (error) throw new Error(`update client ${existingId}: ${error.message}`);
      createdId = existingId;
      await sb.from("legacy_import_clients").update({ import_status: "updated", created_client_id: createdId }).eq("id", sc.id);
    } else {
      const { data: ins, error } = await sb.from("clients").insert(payload).select("id").single();
      if (error) throw new Error(`insert client (${sc.legacy_client_key}): ${error.message}`);
      createdId = ins.id;
      await sb.from("legacy_import_clients").update({ import_status: "created", created_client_id: createdId }).eq("id", sc.id);
    }
    if (sc.legacy_client_key) clientKeyMap.set(sc.legacy_client_key, createdId);
  }

  // 2) Contracts
  const { data: stFestas, error: e2 } = await sb
    .from("legacy_import_festas").select("*").eq("import_batch_id", batchId);
  if (e2) throw new Error("festas staging: " + e2.message);

  const contractKeyMap = new Map<string, string>();

  for (const sf of stFestas || []) {
    const clientId = sf.legacy_client_key ? clientKeyMap.get(sf.legacy_client_key) : null;
    if (!clientId) {
      await sb.from("legacy_import_festas").update({ import_status: "error", errors: "Cliente não encontrado: " + sf.legacy_client_key }).eq("id", sf.id);
      continue;
    }

    // check if contract already exists by legacy_contract_key
    const { data: existing } = await sb
      .from("contracts").select("id").eq("tenant_id", tenantId).eq("legacy_contract_key", sf.legacy_contract_key).maybeSingle();

    const payload: any = {
      tenant_id: tenantId,
      client_id: clientId,
      status: sf.status || "assinado",
      event_date: sf.event_date,
      event_weekday_raw: sf.event_weekday_raw,
      event_start_time: sf.event_start_time,
      event_end_time: sf.event_end_time,
      guest_count: sf.guest_count,
      celebrant_name: sf.celebrant_name,
      celebrant_age: sf.celebrant_age,
      children_pay_from_age: sf.children_pay_from_age,
      decoration: sf.decoration,
      tasting_menu: sf.tasting_menu,
      hot_dish: sf.hot_dish,
      cake: sf.cake,
      kids_menu: sf.kids_menu,
      observations: sf.observations,
      additional_services: sf.additional_services,
      total_value: sf.total_value,
      payment_method: sf.payment_method,
      installment_count: sf.installment_count,
      payment_schedule_raw: sf.payment_schedule_raw,
      contract_form_date: sf.contract_form_date,
      contracted_company_email: sf.contracted_company_email || CONTRACTED_EMAIL,
      source_system: "planilha_bs_v3",
      legacy_contract_key: sf.legacy_contract_key,
      legacy_import_batch_id: batchId,
      legacy_notes: sf.legacy_notes,
      is_historical: !!sf.is_historical,
      financial_scope: sf.financial_scope,
      needs_review: !!sf.needs_review,
      import_warnings: sf.warnings,
    };

    let contractId: string;
    if (existing) {
      const { error } = await sb.from("contracts").update(payload).eq("id", existing.id);
      if (error) throw new Error(`update contract ${sf.legacy_contract_key}: ${error.message}`);
      contractId = existing.id;
      await sb.from("legacy_import_festas").update({ import_status: "updated", created_contract_id: contractId }).eq("id", sf.id);
      // remove existing legacy installments for this contract to avoid dup
      await sb.from("contract_installments").delete().eq("contract_id", contractId).eq("source_system", "planilha_bs_v3");
    } else {
      const { data: ins, error } = await sb.from("contracts").insert(payload).select("id").single();
      if (error) throw new Error(`insert contract ${sf.legacy_contract_key}: ${error.message}`);
      contractId = ins.id;
      await sb.from("legacy_import_festas").update({ import_status: "created", created_contract_id: contractId }).eq("id", sf.id);
    }
    contractKeyMap.set(sf.legacy_contract_key, contractId);
  }

  // 3) Installments
  const { data: stParcelas, error: e3 } = await sb
    .from("legacy_import_parcelas").select("*").eq("import_batch_id", batchId);
  if (e3) throw new Error("parcelas staging: " + e3.message);

  const installmentRows: any[] = [];
  for (const sp of stParcelas || []) {
    const contractId = sp.legacy_contract_key ? contractKeyMap.get(sp.legacy_contract_key) : null;
    if (!contractId) {
      await sb.from("legacy_import_parcelas").update({ import_status: "error", errors: "Contrato não encontrado" }).eq("id", sp.id);
      continue;
    }
    installmentRows.push({
      tenant_id: tenantId,
      contract_id: contractId,
      order_index: sp.order_index ?? 1,
      due_date: sp.due_date,
      amount: sp.amount ?? 0,
      payment_method: sp.payment_method || "PIX",
      payment_status: sp.is_historical ? "historico_importado" : (sp.payment_status || "pendente"),
      paid: sp.is_historical ? true : !!sp.paid,
      paid_at: sp.paid_at,
      charge_customer: sp.is_historical ? false : (sp.charge_customer ?? true),
      card_installments: sp.card_installments,
      raw_line: sp.raw_line,
      source_system: "planilha_bs_v3",
      legacy_contract_key: sp.legacy_contract_key,
      legacy_import_batch_id: batchId,
      is_historical: !!sp.is_historical,
      financial_scope: sp.financial_scope,
      needs_review: !!sp.needs_review,
      import_warnings: sp.warnings,
    });
  }

  if (installmentRows.length) {
    // chunked
    const CK = 200;
    for (let i = 0; i < installmentRows.length; i += CK) {
      const { error } = await sb.from("contract_installments").insert(installmentRows.slice(i, i + CK));
      if (error) throw new Error(`insert installments chunk ${i}: ${error.message}`);
    }
  }

  // 4) Mark batch committed
  await sb
    .from("legacy_import_batches")
    .update({ status: "committed", committed_at: new Date().toISOString(), committed_by: userId })
    .eq("id", batchId);
}
