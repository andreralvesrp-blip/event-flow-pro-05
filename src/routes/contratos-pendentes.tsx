import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileWarning, Sparkles, Check } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listPendingContracts,
  suggestPendingContract,
  confirmPendingContract,
  type PendingSuggestion,
} from "@/lib/pending-contracts.functions";

export const Route = createFileRoute("/contratos-pendentes")({
  head: () => ({
    meta: [
      { title: "Contratos com dados pendentes — Kids Point Hub" },
      { name: "description", content: "Confirme os dados dos contratos assinados em PDF avulso." },
      { property: "og:title", content: "Contratos com dados pendentes — Kids Point Hub" },
      { property: "og:description", content: "Confirme os dados dos contratos assinados em PDF avulso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendingPage,
});

type Item = Awaited<ReturnType<typeof listPendingContracts>>[number];

function PendingPage() {
  const list = useServerFn(listPendingContracts);
  const [items, setItems] = useState<Item[] | null>(null);
  const reload = () => list().then(setItems).catch((e) => toast.error(String(e.message ?? e)));
  useEffect(() => { reload(); }, []);

  return (
    <AppLayout title="Contratos com dados pendentes">
      <p className="text-sm text-muted-foreground mb-4">
        Contratos assinados como PDF avulso, sem o modelo da Clicksign. Os campos vêm preenchidos com a
        sugestão (nome do arquivo ou leitura do PDF pela IA). Nada é gravado até você confirmar.
      </p>
      {items === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum contrato pendente. 🎉</p>
      ) : (
        <div className="grid gap-4">
          {items.map((it) => <PendingCard key={it.id} item={it} onDone={reload} />)}
        </div>
      )}
    </AppLayout>
  );
}

function pickVal<T>(cur: T | null | undefined, sug: T | null | undefined): T | null {
  return (cur ?? sug ?? null) as T | null;
}

function PendingCard({ item, onDone }: { item: Item; onDone: () => void }) {
  const suggest = useServerFn(suggestPendingContract);
  const confirm = useServerFn(confirmPendingContract);
  const [sug, setSug] = useState<PendingSuggestion>(item.suggestion);
  const init = (s: PendingSuggestion) => ({
    event_date: pickVal(item.current.event_date, s.event_date) ?? "",
    event_start_time: (pickVal(item.current.event_start_time, s.event_start_time) ?? "").slice(0, 5),
    event_end_time: (pickVal(item.current.event_end_time, s.event_end_time) ?? "").slice(0, 5),
    total_value: pickVal(item.current.total_value, s.total_value)?.toString() ?? "",
    guest_count: pickVal(item.current.guest_count, s.guest_count)?.toString() ?? "",
    payment_method: pickVal(item.current.payment_method, s.payment_method) ?? "",
    celebrant_name: pickVal(item.current.celebrant_name, s.celebrant_name) ?? "",
  });
  const [f, setF] = useState(init(item.suggestion));
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);

  const runAi = async () => {
    setBusy("ai");
    try {
      const r = await suggest({ data: { id: item.id } });
      if (!r.ok) toast.warning(r.message);
      else { setSug(r.suggestion); setF(init(r.suggestion)); toast.success("Sugestão da IA carregada. Revise e confirme."); }
    } catch (e: any) { toast.error(e.message ?? String(e)); }
    setBusy(null);
  };
  useEffect(() => {
    if (item.has_pdf && item.suggestion.source !== "ia_pdf") runAi();
  }, []);

  const save = async () => {
    setBusy("save");
    try {
      const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\./g, "").replace(",", ".")));
      await confirm({
        data: {
          id: item.id,
          event_date: f.event_date || null,
          event_start_time: f.event_start_time || null,
          event_end_time: f.event_end_time || null,
          total_value: num(f.total_value),
          guest_count: f.guest_count ? Math.round(Number(f.guest_count)) : null,
          payment_method: f.payment_method || null,
          celebrant_name: f.celebrant_name || null,
        },
      });
      toast.success("Dados confirmados.");
      onDone();
    } catch (e: any) { toast.error(e.message ?? String(e)); }
    setBusy(null);
  };

  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <FileWarning className="h-4 w-4 text-primary" />
          {item.client?.full_name ?? "Sem cliente"}
          <Badge variant="outline">Assinado – dados pendentes</Badge>
          {sug.source && (
            <Badge variant="secondary">
              Sugestão: {sug.source === "ia_pdf" ? "leitura do PDF (IA)" : "nome do arquivo"}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {item.file_name ?? "(sem nome de arquivo)"} · assinado em{" "}
          {new Date(item.signed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          {item.client?.email ? ` · ${item.client.email}` : ""}
          {item.client?.phone ? ` · ${item.client.phone}` : ""}
        </p>
        {sug.note && <p className="text-xs text-muted-foreground">Obs. da IA: {sug.note}</p>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {field("event_date", "Data da festa", "date")}
          {field("event_start_time", "Início", "time")}
          {field("event_end_time", "Término", "time")}
          {field("guest_count", "Convidados", "number")}
          {field("total_value", "Valor total (R$)")}
          {field("payment_method", "Forma de pagamento")}
          {field("celebrant_name", "Aniversariante")}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button onClick={save} disabled={busy !== null}>
            <Check className="h-4 w-4 mr-1" /> {busy === "save" ? "Salvando…" : "Confirmar dados"}
          </Button>
          <Button variant="outline" onClick={runAi} disabled={busy !== null}>
            <Sparkles className="h-4 w-4 mr-1" />
            {busy === "ai" ? "Lendo PDF…" : "Ler PDF com IA"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
