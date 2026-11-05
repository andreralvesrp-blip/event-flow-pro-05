import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getPersonalDateView, type PersonalDateView } from '@/lib/personal-dates-view.functions';
import { whatsappUrl, type House, type Option, type Slot, type Turno } from '@/lib/personal-dates';
import pageCss from '@/styles/datas-kids-point.css?url';

const options = (token: string) => queryOptions({ queryKey: ['personal-dates', token], queryFn: () => getPersonalDateView({ data: { token } }), staleTime: 0, retry: false });

export const Route = createFileRoute('/datas/$token')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(options(params.token)),
  head: () => ({
    meta: [{ title: 'Sua data — Kids Point' }, { name: 'description', content: 'Datas da sua festa nas casas Kids Point.' }, { property: 'og:title', content: 'Sua data — Kids Point' }, { property: 'og:description', content: 'Datas da sua festa nas casas Kids Point.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow, noarchive' }, { name: 'referrer', content: 'no-referrer' }],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:wght@400;600;700;800&display=swap' },
      { rel: 'stylesheet', href: pageCss },
    ],
  }),
  component: PersonalDatesPage,
});

// Nomes e endereços exibidos na página da cliente.
const C: Record<House, { n: string; a: string }> = { bosque: { n: 'Ud. Bosque', a: 'Rua Tiquatira, 394' }, vila: { n: 'Ud. Vila Mariana', a: 'Rua Padre Machado, 1161' } };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asDate = (date: string) => new Date(`${date}T12:00:00-03:00`);
const longDate = (date: string) => cap(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(asDate(date)).replace('-feira', ''));
const shortDate = (date: string) => { const d = asDate(date); const w = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(d).replace('-feira', ''); return `${w}, ${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`; };
const R = (n: number) => 'R$ ' + n.toLocaleString('pt-BR');
const T = (slot: Slot) => (slot === 'almoco' ? 'Almoço' : 'Jantar');
const t = (slot: Slot) => (slot === 'almoco' ? 'almoço' : 'jantar');
const P = 3;

type ViewName = 'res' | 'outra' | 'lista' | 'fim';
type Final = { option: Option; turno: string; slot: Turno; price: number; url: string; fila?: boolean };
type State = { v: ViewName; casa: House; page: number; pick: Option | null; final: Final | null };

const Pin = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
);
const Pill = ({ house }: { house: House }) => <p className="upill"><Pin />{C[house].n}</p>;
const TurnLabel = ({ slot, label }: { slot: Turno; label?: string }) => <span className="turn-label">{slot !== 'jantar' && <Sun className="turn-icon sun" aria-hidden="true" />}{slot !== 'almoco' && <Moon className="turn-icon moon" aria-hidden="true" />}{label ?? (slot === 'ambos' ? 'Almoço ou jantar' : T(slot))}</span>;
const Price = ({ n }: { n: number }) => <span className="price">A partir de <strong>{R(n)}</strong> para 40 pagantes</span>;

function PersonalDatesPage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery(options(token));
  return <DatesJourney token={token} initial={data} />;
}

export function DatesJourney({ token, initial }: { token: string; initial: PersonalDateView }) {
  const [view] = useState<PersonalDateView>(initial);
  const house: House = view.origin ?? 'bosque';
  const otherHouse: House = house === 'bosque' ? 'vila' : 'bosque';
  const requestedDate = view.requestedDate;
  const requested = view.requested ?? [];
  const available = requested.filter(o => o.status === 'disponivel');
  const bothOccupied = requested.length > 0 && requested.every(o => o.status === 'ocupado');
  const otherRequested = (view.options ?? []).filter(o => o.date === requestedDate && o.house === otherHouse && o.status === 'disponivel');
  const listFor = (h: House) => (view.options ?? []).filter(o => o.house === h && o.date !== requestedDate);
  const first: ViewName = requested.length === 0 ? 'lista' : bothOccupied ? (otherRequested.length > 0 ? 'outra' : 'lista') : 'res';

  const [S, setS] = useState<State>({ v: first, casa: house, page: 0, pick: null, final: null });
  const [hist, setHist] = useState<State[]>([]);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [error, setError] = useState('');
  const seen = useRef(new Set<string>());

  const go = (v: ViewName, patch: Partial<State> = {}) => { setHist(h => [...h, S]); setS({ ...S, ...patch, v, pick: null }); setError(''); window.scrollTo(0, 0); };
  const back = () => { const prev = hist[hist.length - 1]; if (!prev) return; setHist(h => h.slice(0, -1)); setS(prev); setError(''); window.scrollTo(0, 0); };

  async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/public/personal-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }), keepalive: true });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error ?? 'Vamos confirmar com a equipe.');
    return result;
  }

  useEffect(() => { if (!initial.error) void call({ action: 'abriu' }).catch(() => undefined); }, [token]);

  const pageOf = (h: House, page: number) => {
    const list = listFor(h);
    const days = [...new Set(list.map(o => o.date))];
    return { days, shown: days.slice(page * P, page * P + P).map(d => ({ date: d, slots: list.filter(o => o.date === d).sort((a, b) => Number(a.status === 'interesse') - Number(b.status === 'interesse')) })) };
  };

  // Registra "viu_opcao" para as opções visíveis na tela atual.
  useEffect(() => {
    if (view.state !== 'ready') return;
    const visible: Option[] = S.v === 'res' ? requested : S.v === 'outra' ? otherRequested : S.v === 'lista' ? pageOf(S.casa, S.page).shown.flatMap(d => d.slots) : [];
    for (const option of visible) {
      const key = `${option.house}:${option.date}:${option.slot}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      void call({ action: 'viu_opcao', house: option.house, date: option.date, slot: option.slot }).catch(() => undefined);
    }
  }, [view, S.v, S.casa, S.page]);

  async function choose(option: Option, turno = T(option.slot), price = option.price, slot: Turno = option.slot) {
    setBusy(true); setError('');
    try {
      const result = await call({ action: 'escolheu_data', house: option.house, date: option.date, slot });
      if (!result.url) throw new Error('Vamos confirmar com a equipe.');
      go('fim', { final: { option, turno, slot, price, url: result.url } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Vamos confirmar com a equipe.'); }
    finally { setBusy(false); }
  }

  async function queue(option: Option) {
    setBusy(true); setError('');
    try {
      const result = await call({ action: 'entrou_fila', house: option.house, date: option.date, slot: option.slot });
      if (!result.url) throw new Error('Vamos confirmar com a equipe.');
      go('fim', { final: { option, turno: T(option.slot), slot: option.slot, price: option.price, url: result.url, fila: true } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Vamos confirmar com a equipe.'); }
    finally { setBusy(false); }
  }

  function openWhatsapp(target: House, final?: Final) {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    const url = final?.url ?? whatsappUrl(view.firstName, target);
    // Abrir no próprio clique, antes de qualquer chamada de registro.
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null;
    else window.location.assign(url);
    void call({ action: 'falou_equipe', house: target, date: final?.option.date, slot: final?.slot }).catch(() => undefined);
    // O retorno ao aplicativo permite continuar a jornada, sem cliques repetidos na saída.
    const reset = () => { openingRef.current = false; setOpening(false); };
    window.addEventListener('focus', reset, { once: true });
  }
  const talk = (target: House) => openWhatsapp(target);

  const page = (opts: { band: { t: string; u?: string }; m: React.ReactNode; f?: React.ReactNode; short?: boolean }) => (
    <div className="kpd">
      <div className={`app ${opts.short === false ? '' : 'short'}`}>
        <div className="band">
          <div className="bar">{hist.length ? <button type="button" className="back" onClick={back} disabled={busy}>‹ Voltar</button> : <i />}<em className="brand">Kids Point</em></div>
          <strong>{opts.band.t}</strong>
          {opts.band.u && <span>{opts.band.u}</span>}
        </div>
        <div className="main">
          {opts.m}
          {error && <p className="cap" role="alert">{error}</p>}
        </div>
        {opts.f && <div className="foot">{opts.f}</div>}
      </div>
    </div>
  );
  const hi = { t: `Oi, ${view.firstName}!` };
  const noPrice = view.noPrice;

  if (view.error) return page({ band: { t: 'Link indisponível.' }, m: null });
  if (view.state === 'unopened' || view.state === 'unavailable') {
    const title = view.state === 'unopened' ? 'O calendário dessa data ainda não abriu' : 'Vamos confirmar com a equipe';
    return page({
      band: hi,
      m: <><Pill house={house} /><h1>{title}</h1>{view.state === 'unopened' && <p className="hi">Fale com a nossa equipe, que ajudamos a planejar a festa.</p>}</>,
      f: <button type="button" className="btn w" disabled={busy || opening} onClick={() => talk(house)}>{opening ? 'Abrindo o WhatsApp...' : 'Falar com a equipe'}</button>,
    });
  }

  if (S.v === 'res' && requestedDate) {
    const both = available.length === 2;
    const samePrice = both && available[0].price === available[1].price;
    const only = available.length === 1 ? available[0] : null;
    return page({
      band: hi,
      m: (
        <>
          <Pill house={house} />
          <h1>{longDate(requestedDate)}</h1>
          {both && <p className="ans">Essa data está livre nos dois turnos</p>}
          {only && <p className="ans">Temos {t(only.slot)} disponível nessa data</p>}
          {both && samePrice && !noPrice && <p className="cap">A partir de <strong>{R(available[0].price)}</strong> para 40 pagantes</p>}
          <div className="rows">
            {requested.map(o => {
              if (o.status === 'ocupado') return <div key={o.slot} className="row off"><b><TurnLabel slot={o.slot} /></b><span className="st off">Ocupado</span></div>;
              if (o.status === 'interesse') return (
                <div key={o.slot} className="row int">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b><TurnLabel slot={o.slot} /></b><span className="st int">Pré-reservado</span></div>
                  <p>Outra família está com este turno em pré-reserva. Se ela não confirmar, ele pode ficar com você.</p>
                  <button type="button" className="btn s mini" disabled={busy} onClick={() => queue(o)}>Entrar na fila do {t(o.slot)}</button>
                </div>
              );
              return (
                <div key={o.slot} className={`row ${only ? 'sel' : ''}`}>
                  <b><TurnLabel slot={o.slot} /></b><span className="st on">Disponível</span>
                  {!noPrice && !(both && samePrice) && <Price n={o.price} />}
                  {both && <button type="button" className="btn p mini" disabled={busy} onClick={() => choose(o)}>Quero {shortDate(o.date)}, {t(o.slot)}</button>}
                </div>
              );
            })}
          </div>
        </>
      ),
      f: (
        <>
          {only && <button type="button" className="btn p" disabled={busy} onClick={() => choose(only)}>Quero {shortDate(only.date)}, {t(only.slot)}</button>}
          <button type="button" className="btn s" disabled={busy} onClick={() => go('lista')}>Ver mais opções</button>
        </>
      ),
    });
  }

  if (S.v === 'outra' && requestedDate && otherRequested.length > 0) {
    const turnos = otherRequested.length === 2 ? 'almoço ou jantar' : t(otherRequested[0].slot);
    const cheapest = otherRequested.reduce((a, b) => (b.price < a.price ? b : a));
    return page({
      band: hi,
      m: (
        <>
          <Pill house={house} />
          <h1>Sua data está ocupada na {C[house].n}</h1>
          <p className="hi" style={{ color: 'var(--ink)' }}>Mas ela está disponível na nossa outra unidade:</p>
          <div className="house">
            <h2>{C[otherHouse].n}</h2>
            <div className="addr">{C[otherHouse].a}</div>
            <div className="line">{longDate(requestedDate)} · <TurnLabel slot={otherRequested.length === 2 ? 'ambos' : otherRequested[0].slot} label={turnos} /></div>
            {!noPrice && <Price n={cheapest.price} />}
          </div>
        </>
      ),
      f: (
        <>
          <button type="button" className="btn p" disabled={busy} onClick={() => { void call({ action: 'mudou_casa', mode: 'other' }).catch(() => undefined); const both = otherRequested.length === 2; void choose(otherRequested[0], both ? 'Almoço ou jantar' : T(otherRequested[0].slot), cheapest.price, both ? 'ambos' : otherRequested[0].slot); }}>Quero na {C[otherHouse].n}</button>
          <button type="button" className="btn s" disabled={busy} onClick={() => go('lista', { casa: house, page: 0 })}>Ver datas na {C[house].n}</button>
        </>
      ),
    });
  }

  if (S.v === 'fim' && S.final) {
    const q = S.final;
    return page({
      band: { t: q.fila ? 'Você entrou na fila' : `Boa escolha, ${view.firstName}!` },
      m: (
        <>
          <Pill house={q.option.house} />
          <div className="sum"><strong>{longDate(q.option.date)}</strong><TurnLabel slot={q.slot} label={q.turno} /><br />{C[q.option.house].a}{!noPrice && !q.fila && <><br />A partir de <b>{R(q.price)}</b> para 40 pagantes</>}</div>
          {q.fila ? (
            <>
              <ol className="steps"><li>Continue a conversa com a nossa equipe no WhatsApp.</li><li>Se a pré-reserva não for confirmada, nossa equipe vai te orientar.</li><li>Com o turno liberado, você garante a data com o sinal e o contrato.</li></ol>
              <div className="note"><b>Entrar na fila não reserva a data.</b>Enquanto isso, você pode ver outras opções com a equipe.</div>
            </>
          ) : (
            <div className="note"><b>Esta data ainda não está reservada.</b>A reserva só acontece com o sinal pago e o contrato fechado.</div>
          )}
        </>
      ),
      f: <button type="button" className="btn w" disabled={opening} onClick={() => openWhatsapp(q.option.house, q)}>{opening ? 'Abrindo o WhatsApp...' : `Continuar no WhatsApp da ${C[q.option.house].n}`}</button>,
    });
  }

  // Tela de datas
  const { days, shown } = pageOf(S.casa, S.page);
  const q = S.pick;
  const switchHouse = (h: House) => {
    if (h === S.casa) return;
    void call({ action: 'mudou_casa', mode: h === house ? 'origin' : 'other' }).catch(() => undefined);
    setS({ ...S, casa: h, page: 0, pick: null });
  };
  return page({
    short: false,
    band: { t: 'Escolha uma data', u: bothOccupied && otherRequested.length === 0 ? 'Sua data está ocupada nas duas unidades' : 'Outras opções' },
    m: (
      <>
        {!noPrice && <p className="values-notice">Valores para 40 pagantes</p>}
        <div className="seg" role="group" aria-label="Escolha a unidade">
          {(['bosque', 'vila'] as House[]).map(k => <button key={k} type="button" className={S.casa === k ? 'on' : ''} onClick={() => switchHouse(k)}>{C[k].n}</button>)}
        </div>
        <p className="cap">{C[S.casa].a}</p>
        <div className="days">
          {shown.map(d => (
            <div key={d.date} className="day">
              <h3>{longDate(d.date)}</h3>
              <div className="chips">
                {d.slots.map(o => (
                  <button key={o.slot} type="button" className={`chip ${o.status === 'interesse' ? 'int' : ''} ${q && q.date === o.date && q.slot === o.slot && q.house === o.house ? 'sel' : ''}`} onClick={() => setS({ ...S, pick: o })}>
                    <b><TurnLabel slot={o.slot} /></b>
                    {o.status === 'interesse' ? <span className="queue-status">Pré-reservado</span> : !noPrice && <span>A partir de {R(o.price)}</span>}
                    {!noPrice && o.status === 'disponivel' && o.cheaper && <em>Menor investimento</em>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="cap">Vamos confirmar com a equipe.</p>}
        </div>
        {days.length > P && <button type="button" className="more" onClick={() => setS({ ...S, page: (S.page + 1) * P >= days.length ? 0 : S.page + 1, pick: null })}>Mostrar outras datas</button>}
        <button type="button" className="more" disabled={busy || opening} onClick={() => talk(S.casa)}>{opening ? 'Abrindo o WhatsApp...' : 'Nenhuma serve, falar com a equipe'}</button>
      </>
    ),
    f: (
      <>
        <button type="button" className="btn p" disabled={!q || busy} onClick={() => q && (q.status === 'interesse' ? queue(q) : choose(q))}>{q ? `${q.status === 'interesse' ? 'Entrar na fila de' : 'Quero'} ${shortDate(q.date)}, ${t(q.slot)}` : 'Escolha uma data'}</button>
      </>
    ),
  });
}
