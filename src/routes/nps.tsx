import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useUnit } from "@/contexts/UnitContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/nps")({
  ssr: false,
  component: NpsPage,
});

type NpsRow = {
  id: string;
  created_at: string;
  score: number;
  classification: "promotor" | "neutro" | "detrator";
  experience: "loved" | "ok" | "improve" | null;
  comment: string | null;
  name: string | null;
  whatsapp: string | null;
  status: "novo" | "visto" | "resolvido";
  unit_id: string;
};

const expLabel: Record<string, string> = {
  loved: "Amei",
  ok: "Foi ok",
  improve: "Pode melhorar",
};

const statusOptions: Array<NpsRow["status"]> = ["novo", "visto", "resolvido"];

function NpsPage() {
  const { units, unitFilter, loading: unitLoading } = useUnit();
  const [rows, setRows] = useState<NpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    let q = supabase
      .from("nps_responses")
      .select(
        "id, created_at, score, classification, experience, comment, name, whatsapp, status, unit_id",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (unitFilter) q = q.eq("unit_id", unitFilter);
    const { data } = await q;
    setRows((data ?? []) as NpsRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!unitLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitFilter, unitLoading]);

  const visibleUnits = useMemo(
    () => (unitFilter ? units.filter((u) => u.id === unitFilter) : units),
    [units, unitFilter],
  );

  const kpis = useMemo(() => {
    const total = rows.length;
    const promo = rows.filter((r) => r.classification === "promotor").length;
    const neut = rows.filter((r) => r.classification === "neutro").length;
    const detr = rows.filter((r) => r.classification === "detrator").length;
    const avg = total > 0 ? rows.reduce((a, r) => a + r.score, 0) / total : 0;
    const nps = total > 0 ? Math.round(((promo - detr) / total) * 100) : 0;
    return { total, promo, neut, detr, avg, nps };
  }, [rows]);

  const filtered = useMemo(
    () => (classFilter === "all" ? rows : rows.filter((r) => r.classification === classFilter)),
    [rows, classFilter],
  );

  const detractors = useMemo(
    () => rows.filter((r) => r.classification === "detrator"),
    [rows],
  );

  async function updateStatus(id: string, status: NpsRow["status"]) {
    const { error } = await supabase
      .from("nps_responses")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success("Status atualizado");
  }

  return (
    <AppLayout title="NPS">
      <div className="max-w-6xl space-y-6">
        {/* Link de avaliação */}
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Link de avaliação
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleUnits.map((u) => (
              <LinkCard key={u.id} slug={u.slug} name={u.name} />
            ))}
            {visibleUnits.length === 0 && !unitLoading && (
              <Card>
                <CardContent className="p-5 text-sm text-slate-500">
                  Nenhuma unidade acessível.
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* KPIs */}
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">Indicadores</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Kpi label="NPS" value={loading ? "—" : `${kpis.nps}`} accent />
            <Kpi label="Respostas" value={loading ? "—" : String(kpis.total)} />
            <Kpi
              label="Nota média"
              value={loading ? "—" : kpis.total ? kpis.avg.toFixed(1) : "—"}
            />
            <Kpi label="Promotores" value={loading ? "—" : String(kpis.promo)} color="text-emerald-700" />
            <Kpi label="Neutros" value={loading ? "—" : String(kpis.neut)} color="text-amber-700" />
            <Kpi label="Detratores" value={loading ? "—" : String(kpis.detr)} color="text-red-700" />
          </div>
        </section>

        {/* Fila de detratores */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wide text-slate-500">
              Fila de detratores
            </h2>
            <span className="text-xs text-slate-500">{detractors.length} pendente(s)</span>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Comentário</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="w-[160px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detractors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-slate-500 py-6">
                        Sem detratores no momento.
                      </TableCell>
                    </TableRow>
                  )}
                  {detractors.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-600">
                        {formatDate(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{r.score}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                          {r.comment || <span className="text-slate-400">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <div>{r.name || "—"}</div>
                        <div className="text-slate-500">{r.whatsapp || ""}</div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={r.status}
                          onValueChange={(v) => updateStatus(r.id, v as NpsRow["status"])}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* Lista de respostas */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wide text-slate-500">Todas as respostas</h2>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as classificações</SelectItem>
                <SelectItem value="promotor">Promotores</SelectItem>
                <SelectItem value="neutro">Neutros</SelectItem>
                <SelectItem value="detrator">Detratores</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Classif.</TableHead>
                    <TableHead>Experiência</TableHead>
                    <TableHead>Comentário</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-slate-500 py-6">
                        Sem respostas.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-600">
                        {formatDate(r.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">{r.score}</TableCell>
                      <TableCell>
                        <ClassBadge value={r.classification} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {r.experience ? expLabel[r.experience] : "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="text-sm text-slate-800 truncate" title={r.comment || ""}>
                          {r.comment || <span className="text-slate-400">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{r.name || "—"}</TableCell>
                      <TableCell className="text-xs">{r.whatsapp || "—"}</TableCell>
                      <TableCell className="text-xs">{r.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}

function Kpi({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div
          className={`text-2xl font-semibold mt-1 ${
            accent ? "text-emerald-700" : color || "text-slate-900"
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function ClassBadge({ value }: { value: NpsRow["classification"] }) {
  if (value === "promotor")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Promotor</Badge>;
  if (value === "detrator")
    return <Badge variant="destructive">Detrator</Badge>;
  return <Badge variant="secondary">Neutro</Badge>;
}

function LinkCard({ slug, name }: { slug: string; name: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/avaliar/${slug}`;
  const qrRef = useRef<HTMLDivElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function download() {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `qr-avaliar-${slug}.png`;
    link.click();
  }

  function print() {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>QR ${name}</title></head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui;padding:40px;">
      <h2>${name}</h2><p style="color:#555;font-size:14px">Avalie sua festa</p>
      <img src="${dataUrl}" style="width:320px;height:320px"/>
      <p style="font-size:12px;color:#777;margin-top:12px">${url}</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{name}</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-4">
        <div ref={qrRef} className="shrink-0 bg-white p-2 rounded border border-slate-200">
          <QRCodeCanvas value={url} size={120} includeMargin={false} />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
            <LinkIcon className="w-3 h-3 shrink-0" />
            <span className="truncate" title={url}>
              {url}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="w-3.5 h-3.5" /> Copiar link
            </Button>
            <Button size="sm" variant="outline" onClick={download}>
              <Download className="w-3.5 h-3.5" /> Baixar QR
            </Button>
            <Button size="sm" variant="outline" onClick={print}>
              Imprimir
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
