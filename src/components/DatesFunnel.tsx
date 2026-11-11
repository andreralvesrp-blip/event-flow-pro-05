import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/browser-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Row = { opportunity_id: string; action: string; detail: string | null };
type Stats = { sent: number; opened: number; tapped: number; requested: number; other: number; calendar: number };
const empty = (): Stats => ({ sent: 0, opened: 0, tapped: 0, requested: 0, other: 0, calendar: 0 });

/** Funil da página pessoal de datas nos últimos 30 dias (oportunidades distintas). */
export function DatesFunnel({ unitFilter }: { unitFilter: string | null }) {
  const [data, setData] = useState<{ all: Stats; email: Stats; whatsapp: Stats } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      let opps = supabase.from("opportunities").select("id").gte("created_at", since);
      if (unitFilter) opps = opps.eq("unit_id", unitFilter);
      const { data: op } = await opps;
      const ids = (op ?? []).map((o) => o.id);
      const sends: { opportunity_id: string }[] = [], acts: Row[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [s, a] = await Promise.all([
          supabase.from("quote_sends").select("opportunity_id").in("opportunity_id", chunk).eq("status", "enviado"),
          supabase.from("date_interactions").select("opportunity_id,action,detail").in("opportunity_id", chunk).in("action", ["abriu", "escolheu_data", "entrou_fila", "abriu_calendario"]),
        ]);
        sends.push(...(s.data ?? [])); acts.push(...((a.data ?? []) as Row[]));
      }
      // Origem por oportunidade = origem da primeira abertura registrada.
      const origin = new Map<string, string>();
      for (const r of acts) if (r.action === "abriu" && !origin.has(r.opportunity_id)) origin.set(r.opportunity_id, r.detail === "email" ? "email" : "whatsapp");
      const build = (keep: (id: string) => boolean): Stats => {
        const set = (f: (r: Row) => boolean) => new Set(acts.filter((r) => keep(r.opportunity_id) && f(r)).map((r) => r.opportunity_id)).size;
        return {
          sent: new Set(sends.map((s) => s.opportunity_id).filter(keep)).size,
          opened: set((r) => r.action === "abriu"),
          tapped: set((r) => r.action === "escolheu_data" || r.action === "entrou_fila"),
          requested: set((r) => r.action === "escolheu_data" && r.detail === "data_pedida"),
          other: set((r) => r.action === "escolheu_data" && (r.detail === "alternativa" || r.detail === "calendario")),
          calendar: set((r) => r.action === "abriu_calendario"),
        };
      };
      if (alive) setData({ all: build(() => true), email: build((id) => origin.get(id) === "email"), whatsapp: build((id) => origin.get(id) === "whatsapp") });
    })().catch(() => alive && setData({ all: empty(), email: empty(), whatsapp: empty() }));
    return () => { alive = false; };
  }, [unitFilter]);
  const rows: Array<[keyof Stats, string]> = [["sent", "Orçamentos enviados"], ["opened", "Abriram a página"], ["tapped", "Tocaram num turno"], ["requested", "Escolheram a data pedida"], ["other", "Escolheram outra data"], ["calendar", "Abriram o calendário"]];
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-base">Página de datas · últimos 30 dias</CardTitle></CardHeader>
      <CardContent>
        {!data ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground text-xs"><th className="text-left font-medium py-1"></th><th className="text-right font-medium">Total</th><th className="text-right font-medium">WhatsApp</th><th className="text-right font-medium">E-mail</th></tr></thead>
            <tbody>{rows.map(([k, l]) => <tr key={k} className="border-t border-border"><td className="py-1.5">{l}</td><td className="text-right font-semibold">{data.all[k]}</td><td className="text-right">{k === "sent" ? "—" : data.whatsapp[k]}</td><td className="text-right">{k === "sent" ? "—" : data.email[k]}</td></tr>)}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
