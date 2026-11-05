import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, MapPin, MessageCircle, Moon, Sun, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPersonalDateView, type PersonalDateView } from '@/lib/personal-dates-view.functions';
import { HOUSES, type House, type Option } from '@/lib/personal-dates';
const options = (token: string) => queryOptions({ queryKey: ['personal-dates', token], queryFn: () => getPersonalDateView({ data: { token } }), staleTime: 0, retry: false });
export const Route = createFileRoute('/datas/$token')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(options(params.token)),
  head: () => ({ meta: [{ title: 'Sua data — Kids Point' }, { name: 'description', content: 'Datas da sua festa nas casas Kids Point.' }, { property: 'og:title', content: 'Sua data — Kids Point' }, { property: 'og:description', content: 'Datas da sua festa nas casas Kids Point.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow, noarchive' }, { name: 'referrer', content: 'no-referrer' }] }),
  component: PersonalDatesPage,
});
const dateLabel = (date: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${date}T12:00:00-03:00`));
const priceLabel = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
function PersonalDatesPage() {
  const { token } = Route.useParams();
  const { data: initial } = useSuspenseQuery(options(token));
  const [view, setView] = useState<PersonalDateView>(initial), [mode, setMode] = useState<'all'|'origin'|'other'>('all'), [offset, setOffset] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const seen = useRef(new Set<string>());
  async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/public/personal-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, mode, ...body }) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error ?? 'Vamos confirmar com a equipe.');
    return result;
  }
  useEffect(() => { if (!initial.error) void call({ action: 'abriu' }).catch(() => undefined); }, [token]);
  const visible = view.options?.slice(offset, offset + 3) ?? [];
  useEffect(() => {
    if (view.state !== 'ready') return;
    for (const option of [...(view.requested ?? []), ...visible]) {
      const key = `${option.house}:${option.date}:${option.slot}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      void call({ action: 'viu_opcao', house: option.house, date: option.date, slot: option.slot }).catch(() => undefined);
    }
  }, [view, offset]);
  async function recalculate(next: typeof mode, nextOffset = 0) {
    setBusy(true); setError('');
    try { const result = await call({ mode: next, ...(next !== mode ? { action: 'mudou_casa' } : {}) }); setView(result); setMode(next); setOffset(nextOffset); }
    catch(e) { setError(e instanceof Error ? e.message : 'Vamos confirmar com a equipe.'); }
    finally { setBusy(false); }
  }
  async function choose(action: 'escolheu_data'|'entrou_fila'|'falou_equipe', house: House, option?: Option) {
    // Abrir durante o clique evita bloqueio de janela após a consulta ao servidor.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true); setError('');
    try {
      const result = await call({ action, house, date: option?.date, slot: option?.slot });
      if (!result.url) throw new Error('Vamos confirmar com a equipe.');
      if (popup) popup.location.replace(result.url); else window.location.assign(result.url);
    } catch(e) { popup?.close(); setError(e instanceof Error ? e.message : 'Vamos confirmar com a equipe.'); }
    finally { setBusy(false); }
  }
  const house = view.origin ?? 'bosque';
  function DateOption({ option }: { option: Option }) {
    const alternate = option.house !== house;
    return <article className={`border rounded-lg p-5 flex flex-col gap-3 ${alternate ? 'border-date-other bg-date-other-soft' : 'border-border bg-card'}`}>
      <div className="flex items-center justify-between gap-2"><span className={`text-sm font-semibold ${alternate ? 'text-date-other' : 'text-foreground'}`}>{HOUSES[option.house].name}</span>{alternate && <span className="text-xs font-semibold text-date-other">Outra casa</span>}</div>
      <h3 className="text-lg font-semibold capitalize">{dateLabel(option.date)}</h3>
      <div className="flex items-center gap-2 text-sm">{option.slot === 'almoco' ? <Sun className="size-4"/> : <Moon className="size-4"/>}{option.slot === 'almoco' ? 'Almoço' : 'Jantar'}<span className={`ml-auto text-xs font-medium ${option.status === 'disponivel' ? 'text-date-available' : 'text-muted-foreground'}`}>{option.status === 'disponivel' ? 'Disponível' : option.status === 'interesse' ? 'Interesse' : 'Ocupado'}</span></div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0"/>{HOUSES[option.house].address}</div>
      {!view.noPrice && <div className="mt-1"><p className="text-xs text-muted-foreground">A partir de</p><p className="text-2xl font-semibold">{priceLabel(option.price)}</p><p className="text-xs text-muted-foreground">40 pagantes</p>{option.cheaper && <span className="text-xs font-semibold text-date-available">Mais em conta</span>}</div>}
      {option.status === 'interesse' && <p className="text-sm text-muted-foreground">Existe outra pessoa interessada neste turno.</p>}
      <div className="mt-auto pt-2">{option.status === 'disponivel' ? <Button className="w-full" disabled={busy} onClick={() => choose('escolheu_data', option.house, option)}>Quero esta data<ArrowRight className="size-4"/></Button> : option.status === 'interesse' ? <><Button variant="outline" className="w-full whitespace-normal h-auto min-h-10" disabled={busy} onClick={() => choose('entrou_fila', option.house, option)}>Entrar na fila desta data</Button><p className="text-xs text-muted-foreground mt-2">A fila não é reserva nem pré-reserva.</p></> : <Button variant="outline" className="w-full" disabled={busy} onClick={() => choose('falou_equipe', option.house, option)}>Falar com a equipe</Button>}</div>
    </article>;
  }
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border"><div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between"><span className="text-xl font-semibold">Kids Point</span><CalendarDays className="size-5 text-date-available"/></div></header>
    <main className="max-w-5xl mx-auto px-5 py-8 md:py-12 space-y-8">
      <section className="flex items-center gap-5"><img src="/atendente-kidspoint.webp" alt="Atendente Kids Point" className="size-20 object-cover rounded-full shrink-0"/><div><p className="text-sm text-muted-foreground">Sua festa na Kids Point</p><h1 className="text-3xl font-semibold mt-1">{view.firstName ? `${view.firstName}, vamos encontrar sua data?` : 'Sua data na Kids Point'}</h1></div></section>
      {view.error ? <p role="alert">Link indisponível.</p> : <>
        {view.state === 'unopened' ? <p className="text-lg">Este calendário ainda não abriu. Fale com a equipe.</p> : view.state === 'unavailable' ? <p className="text-lg">Vamos confirmar com a equipe.</p> : <>
          {view.requested?.length > 0 && <section><h2 className="text-xl font-semibold mb-4">A data que você pediu</h2><div className="grid md:grid-cols-2 gap-4">{view.requested.map(o => <DateOption key={`${o.house}${o.slot}`} option={o}/>)}</div></section>}
          <section className="border-t border-border pt-7"><div className="flex flex-wrap items-center gap-3 mb-5"><h2 className="text-xl font-semibold mr-auto">Outras possibilidades</h2><Button variant="ghost" size="icon" title="Atualizar opções" aria-label="Atualizar opções" disabled={busy} onClick={() => recalculate(mode)}><RefreshCw className="size-4"/></Button></div><div className="flex flex-wrap gap-2 mb-5"><Button variant={mode === 'origin' ? 'default' : 'outline'} className="whitespace-normal h-auto min-h-10 text-left" disabled={busy} onClick={() => recalculate('origin')}>Prefiro outra data na {HOUSES[house].name}</Button><Button variant={mode === 'other' ? 'default' : 'outline'} disabled={busy} onClick={() => recalculate('other')}>Ver outra casa</Button></div><div className="grid md:grid-cols-3 gap-4">{visible.map(o => <DateOption key={`${o.house}${o.date}${o.slot}`} option={o}/>)}</div>{visible.length === 0 && <p className="text-muted-foreground">Vamos confirmar com a equipe.</p>}{offset + 3 < view.options.length && <Button variant="outline" className="mt-5" disabled={busy} onClick={() => recalculate(mode, offset + 3)}>Ver mais opções<ArrowRight className="size-4"/></Button>}</section>
        </>}
        <section className="border-t border-border pt-6"><p className="text-sm text-muted-foreground">Disponível no momento. A data só é reservada com o sinal pago e o contrato fechado.</p><div className="flex flex-wrap gap-3 mt-5">{(['bosque','vila'] as const).map(h => <Button key={h} variant="outline" disabled={busy} onClick={() => choose('falou_equipe', h)}><MessageCircle className="size-4"/>Falar com a equipe · {HOUSES[h].name}</Button>)}</div></section>
      </>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </main>
  </div>;
}