import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MapPin, MessageCircle, Moon, Sun } from 'lucide-react';
import { getPersonalDateView, type PersonalDateView } from '@/lib/personal-dates-view.functions';
import { HOUSES, type House, type Option, type Slot } from '@/lib/personal-dates';

const options = (token: string) => queryOptions({ queryKey: ['personal-dates', token], queryFn: () => getPersonalDateView({ data: { token } }), staleTime: 0, retry: false });

export const Route = createFileRoute('/datas/$token')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(options(params.token)),
  head: () => ({
    meta: [{ title: 'Sua data — Kids Point' }, { name: 'description', content: 'Datas da sua festa nas casas Kids Point.' }, { property: 'og:title', content: 'Sua data — Kids Point' }, { property: 'og:description', content: 'Datas da sua festa nas casas Kids Point.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow, noarchive' }, { name: 'referrer', content: 'no-referrer' }],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=swap' },
    ],
  }),
  component: PersonalDatesPage,
});

const dateLabel = (date: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${date}T12:00:00-03:00`));
const shortDate = (date: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00-03:00`));
const priceLabel = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const slotLabel = (slot: Slot) => (slot === 'almoco' ? 'Almoço' : 'Jantar');

type Step = 1 | 2 | 3 | 4;

function PersonalDatesPage() {
  const { token } = Route.useParams();
  const { data: initial } = useSuspenseQuery(options(token));
  const [view] = useState<PersonalDateView>(initial);
  const [history, setHistory] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedNearby, setSelectedNearby] = useState<number | null>(null);
  const [nearbyCount, setNearbyCount] = useState(3);
  const [chosen, setChosen] = useState<{ option: Option; url: string } | null>(null);
  const seen = useRef(new Set<string>());

  const house = view.origin ?? 'bosque';
  const otherHouse: House = house === 'bosque' ? 'vila' : 'bosque';
  const requestedDate = view.requestedDate;
  const requested = view.requested ?? [];
  const requestedAvailable = requested.filter(o => o.status === 'disponivel');
  const bothOccupied = requested.length > 0 && requested.every(o => o.status === 'ocupado');
  const otherRequested = (view.options ?? []).filter(o => o.date === requestedDate && o.house === otherHouse);
  const nearby = (view.options ?? []).filter(o => o.date !== requestedDate);

  const firstStep: Step = requested.length === 0 ? 3 : bothOccupied ? (otherRequested.length > 0 ? 2 : 3) : 1;
  const [step, setStep] = useState<Step>(firstStep);
  const goTo = (next: Step) => { setHistory(h => [...h, step]); setStep(next); setError(''); };
  const goBack = () => { const prev = history[history.length - 1]; if (!prev) return; setHistory(h => h.slice(0, -1)); setStep(prev); setError(''); };

  async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/public/personal-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error ?? 'Vamos confirmar com a equipe.');
    return result;
  }

  useEffect(() => { if (!initial.error) void call({ action: 'abriu' }).catch(() => undefined); }, [token]);

  // Registra "viu_opcao" para as opções visíveis na etapa atual.
  useEffect(() => {
    if (view.state !== 'ready') return;
    const visible: Option[] = step === 1 ? requested : step === 2 ? otherRequested : step === 3 ? nearby.slice(0, nearbyCount) : [];
    for (const option of visible) {
      const key = `${option.house}:${option.date}:${option.slot}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      void call({ action: 'viu_opcao', house: option.house, date: option.date, slot: option.slot }).catch(() => undefined);
    }
  }, [view, step, nearbyCount]);

  async function chooseDate(option: Option) {
    setBusy(true); setError('');
    try {
      const result = await call({ action: 'escolheu_data', house: option.house, date: option.date, slot: option.slot });
      if (!result.url) throw new Error('Vamos confirmar com a equipe.');
      setChosen({ option, url: result.url });
      goTo(4);
    } catch (e) { setError(e instanceof Error ? e.message : 'Vamos confirmar com a equipe.'); }
    finally { setBusy(false); }
  }

  async function openWhatsApp(action: 'entrou_fila' | 'falou_equipe', target: House, option?: Option) {
    // Abrir durante o clique evita bloqueio de janela após a consulta ao servidor.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true); setError('');
    try {
      const result = await call({ action, house: target, date: option?.date, slot: option?.slot });
      if (!result.url) throw new Error('Vamos confirmar com a equipe.');
      if (popup) popup.location.replace(result.url); else window.location.assign(result.url);
    } catch (e) { popup?.close(); setError(e instanceof Error ? e.message : 'Vamos confirmar com a equipe.'); }
    finally { setBusy(false); }
  }

  function goToNextAfterStep1() {
    if (otherRequested.length > 0) {
      void call({ action: 'mudou_casa', mode: 'other' }).catch(() => undefined);
      goTo(2);
    } else {
      goTo(3);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background font-journey text-journey-ink">
      <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-5 py-6">{children}</main>
    </div>
  );

  if (view.error) return shell(<SimpleMessage title="Link indisponível." />);
  if (view.state === 'unopened') return shell(<SimpleMessage title="Este calendário ainda não abriu." whatsapp onTalk={() => openWhatsApp('falou_equipe', house)} busy={busy} house={house} />);
  if (view.state === 'unavailable') return shell(<SimpleMessage title="Vamos confirmar com a equipe." whatsapp onTalk={() => openWhatsApp('falou_equipe', house)} busy={busy} house={house} />);

  const stepHeader = step <= 3 ? (
    <div className="mb-5 flex items-center gap-3">
      {history.length > 0 && (
        <button type="button" onClick={goBack} disabled={busy} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-journey-ink/70">
          <ArrowLeft className="size-4" /> Voltar
        </button>
      )}
      <span className="ml-auto text-xs font-semibold tracking-wide text-journey-ink/60">Passo {step} de 3</span>
    </div>
  ) : null;

  return shell(
    <>
      {stepHeader}
      {step === 1 && (
        <section className="flex flex-1 flex-col">
          <h1 className="font-journey-display text-2xl font-semibold leading-tight">
            {requestedAvailable.length > 0 ? `${view.firstName}, temos uma opção nessa data` : 'Sua data na Kids Point'}
          </h1>
          <p className="mt-2 text-sm capitalize text-journey-ink/70">{requestedDate ? dateLabel(requestedDate) : ''} · {HOUSES[house].name}</p>
          <div className="mt-5 flex flex-col gap-3">
            {requested.map(option => (
              <RequestedLine key={option.slot} option={option} noPrice={view.noPrice} selected={selectedSlot === option.slot} onSelect={() => setSelectedSlot(option.slot)} onQueue={() => openWhatsApp('entrou_fila', house, option)} busy={busy} />
            ))}
          </div>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            {requestedAvailable.length > 0 && (
              <button type="button" disabled={busy || (requestedAvailable.length === 2 && !selectedSlot)} onClick={() => { const slot = requestedAvailable.length === 1 ? requestedAvailable[0].slot : selectedSlot; const option = requested.find(o => o.slot === slot); if (option) void chooseDate(option); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-journey-coral px-4 py-3 text-base font-bold text-white disabled:opacity-50">
                {requestedAvailable.length === 1 ? `Quero o ${requestedAvailable[0].slot === 'almoco' ? 'almoço' : 'jantar'}` : selectedSlot ? `Quero o ${selectedSlot === 'almoco' ? 'almoço' : 'jantar'}` : 'Escolha um turno acima'}
                <ArrowRight className="size-4" />
              </button>
            )}
            <button type="button" disabled={busy} onClick={goToNextAfterStep1} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-journey-ink/20 px-4 py-3 text-base font-semibold text-journey-ink">
              Ver outras opções
            </button>
            {!view.noPrice && <p className="text-center text-xs text-journey-ink/60">Valores para 40 pagantes. Disponível no momento.</p>}
          </div>
        </section>
      )}
      {step === 2 && otherRequested.length > 0 && (
        <section className="flex flex-1 flex-col">
          <h1 className="font-journey-display text-2xl font-semibold leading-tight">Essa data está ocupada na {HOUSES[house].name}</h1>
          <article className="mt-5 rounded-2xl border-2 border-journey-mint-border bg-journey-mint p-5">
            <p className="text-lg font-bold">{HOUSES[otherHouse].name}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-journey-ink/70"><MapPin className="size-3.5 shrink-0" />{HOUSES[otherHouse].address}</p>
            <p className="mt-3 text-sm font-semibold capitalize">{requestedDate ? dateLabel(requestedDate) : ''}</p>
            <div className="mt-2 flex flex-col gap-1">
              {otherRequested.map(o => (
                <p key={o.slot} className="flex items-center gap-2 text-sm">
                  {o.slot === 'almoco' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {slotLabel(o.slot)}
                  {!view.noPrice && <span className="ml-auto font-bold">A partir de {priceLabel(o.price)}</span>}
                </p>
              ))}
            </div>
          </article>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <button type="button" disabled={busy} onClick={() => { const option = otherRequested.length === 1 ? otherRequested[0] : otherRequested.find(o => o.slot === selectedSlot) ?? otherRequested[0]; void chooseDate(option); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-journey-coral px-4 py-3 text-base font-bold text-white disabled:opacity-50">
              Quero na {HOUSES[otherHouse].name}<ArrowRight className="size-4" />
            </button>
            <button type="button" disabled={busy} onClick={() => goTo(3)} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-journey-ink/20 px-4 py-3 text-base font-semibold text-journey-ink">
              Ver datas próximas na {HOUSES[house].name}
            </button>
          </div>
        </section>
      )}
      {step === 3 && (
        <section className="flex flex-1 flex-col">
          <h1 className="font-journey-display text-2xl font-semibold leading-tight">Datas próximas na {HOUSES[house].name}</h1>
          <div className="mt-5 flex flex-col gap-2">
            {nearby.slice(0, nearbyCount).map((option, index) => {
              const alternate = option.house !== house;
              const selected = selectedNearby === index;
              return (
                <button key={`${option.house}${option.date}${option.slot}`} type="button" onClick={() => setSelectedNearby(index)} className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-left ${selected ? 'border-journey-coral bg-journey-mint' : alternate ? 'border-journey-mint-border bg-journey-mint/50' : 'border-journey-ink/15 bg-card'}`}>
                  <span className="flex-1">
                    <span className="block text-sm font-bold capitalize">{shortDate(option.date)} · {slotLabel(option.slot)}</span>
                    {alternate && <span className="block text-xs font-semibold text-journey-ink/70">{HOUSES[option.house].name}</span>}
                  </span>
                  {!view.noPrice && <span className="text-sm font-bold">{priceLabel(option.price)}</span>}
                  {!view.noPrice && option.cheaper && <span className="rounded-full bg-journey-warning px-2 py-0.5 text-[11px] font-bold">Mais em conta</span>}
                </button>
              );
            })}
            {nearby.length === 0 && <p className="text-sm text-journey-ink/70">Vamos confirmar com a equipe.</p>}
          </div>
          {nearbyCount < nearby.length && (
            <button type="button" onClick={() => setNearbyCount(c => c + 3)} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-journey-ink/20 px-4 py-2 text-sm font-semibold text-journey-ink">
              Ver mais datas
            </button>
          )}
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <button type="button" disabled={busy || selectedNearby === null} onClick={() => { const option = selectedNearby !== null ? nearby[selectedNearby] : null; if (option) void chooseDate(option); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-journey-coral px-4 py-3 text-base font-bold text-white disabled:opacity-50">
              Quero esta data<ArrowRight className="size-4" />
            </button>
            <button type="button" disabled={busy} onClick={() => openWhatsApp('falou_equipe', house)} className="text-sm font-semibold text-journey-ink/60 underline underline-offset-2">
              Nenhuma serve, falar com a equipe
            </button>
          </div>
        </section>
      )}
      {step === 4 && chosen && (
        <section className="flex flex-1 flex-col">
          <h1 className="font-journey-display text-2xl font-semibold leading-tight">Boa escolha, {view.firstName}!</h1>
          <article className="mt-5 rounded-2xl border border-journey-ink/15 bg-card p-5">
            <p className="text-lg font-bold capitalize">{dateLabel(chosen.option.date)}</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold">{chosen.option.slot === 'almoco' ? <Sun className="size-4" /> : <Moon className="size-4" />}{slotLabel(chosen.option.slot)}</p>
            <p className="mt-3 text-sm font-bold">{HOUSES[chosen.option.house].name}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-journey-ink/70"><MapPin className="size-3.5 shrink-0" />{HOUSES[chosen.option.house].address}</p>
          </article>
          <p className="mt-4 text-sm">Agora é só falar com nossa equipe para combinar os detalhes.</p>
          <p className="mt-3 rounded-xl bg-journey-warning p-3 text-xs font-semibold">Esta data ainda não está reservada. A reserva acontece com o sinal pago e o contrato fechado.</p>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <button type="button" onClick={() => window.open(chosen.url, '_blank', 'noopener')} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-journey-whatsapp px-4 py-3 text-base font-bold text-white">
              <MessageCircle className="size-5" />Continuar no WhatsApp da {HOUSES[chosen.option.house].name}
            </button>
            <button type="button" disabled={busy} onClick={() => { setChosen(null); setSelectedNearby(null); setSelectedSlot(null); setHistory([]); setStep(3); }} className="text-sm font-semibold text-journey-ink/60 underline underline-offset-2">
              Voltar e escolher outra data
            </button>
          </div>
        </section>
      )}
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p>}
    </>,
  );
}

function RequestedLine({ option, noPrice, selected, onSelect, onQueue, busy }: { option: Option; noPrice: boolean; selected: boolean; onSelect: () => void; onQueue: () => void; busy: boolean }) {
  if (option.status === 'ocupado') {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl bg-journey-ink/5 px-4 py-3 text-sm text-journey-ink/50">
        {option.slot === 'almoco' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {slotLabel(option.slot)}<span className="ml-auto font-semibold">Ocupado</span>
      </div>
    );
  }
  if (option.status === 'interesse') {
    return (
      <div className="rounded-xl bg-journey-warning p-4">
        <p className="flex items-center gap-2 text-sm font-bold">{option.slot === 'almoco' ? <Sun className="size-4" /> : <Moon className="size-4" />}{slotLabel(option.slot)}</p>
        <p className="mt-1 text-xs">Existe outra pessoa interessada neste turno.</p>
        <button type="button" disabled={busy} onClick={onQueue} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-journey-ink/25 px-4 py-2 text-sm font-bold">
          Entrar na fila desta data
        </button>
        <p className="mt-2 text-[11px] text-journey-ink/60">A fila não é reserva nem pré-reserva.</p>
      </div>
    );
  }
  return (
    <button type="button" onClick={onSelect} className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-4 py-3 text-left ${selected ? 'border-journey-coral bg-journey-mint' : 'border-journey-mint-border bg-journey-mint'}`}>
      {option.slot === 'almoco' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="text-sm font-bold">{slotLabel(option.slot)}</span>
      {!noPrice && <span className="ml-auto text-sm font-bold">A partir de {priceLabel(option.price)}</span>}
      {!noPrice && option.cheaper && <span className="rounded-full bg-journey-warning px-2 py-0.5 text-[11px] font-bold">Mais em conta</span>}
    </button>
  );
}

function SimpleMessage({ title, whatsapp = false, onTalk, busy = false, house = 'bosque' }: { title: string; whatsapp?: boolean; onTalk?: () => void; busy?: boolean; house?: House }) {
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="font-journey-display text-2xl font-semibold leading-tight">{title}</h1>
      {whatsapp && (
        <div className="mt-auto pt-6">
          <button type="button" disabled={busy} onClick={onTalk} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-journey-whatsapp px-4 py-3 text-base font-bold text-white">
            <MessageCircle className="size-5" />Falar com a equipe da {HOUSES[house].name}
          </button>
        </div>
      )}
    </section>
  );
}
