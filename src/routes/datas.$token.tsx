import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useQuery, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Sun, Moon, MapPin, CalendarDays, ChevronLeft, ChevronRight, ArrowLeft, MessageCircle } from 'lucide-react';
import { getPersonalDateBase, getPersonalDateFull, getPersonalDateMonth, type PersonalDateBase, type Asked, type MonthDay } from '@/lib/personal-dates-view.functions';
import { pickUrl, UNIT_NAME, type DayTurns, type Slot, type Availability } from '@/lib/personal-dates';
import pageCss from '@/styles/datas-kids-point.css?url';
import v2Css from '@/styles/datas-v2.css?url';
import { LinkUnavailable } from '@/components/LinkUnavailable';

const baseQ = (token: string) => queryOptions({ queryKey: ['pd-base', token], queryFn: () => getPersonalDateBase({ data: { token } }).catch((): PersonalDateBase => ({ error: 'Link indisponível' } as PersonalDateBase)), staleTime: 0, retry: false });
const fullQ = (token: string) => queryOptions({ queryKey: ['pd-full', token], queryFn: () => getPersonalDateFull({ data: { token } }), staleTime: 60_000, retry: 1 });
const monthQ = (token: string, month: string) => queryOptions({ queryKey: ['pd-month', token, month], queryFn: () => getPersonalDateMonth({ data: { token, month } }), staleTime: 5 * 60_000 });

export const Route = createFileRoute('/datas/$token')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(baseQ(params.token)),
  head: () => ({
    meta: [{ title: 'Sua data — Kids Point' }, { name: 'description', content: 'Veja os turnos livres para a sua festa na Kids Point.' }, { property: 'og:title', content: 'Sua data — Kids Point' }, { property: 'og:description', content: 'Veja os turnos livres para a sua festa na Kids Point.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow, noarchive' }, { name: 'referrer', content: 'no-referrer' }],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:wght@400;600;700;800&display=swap' },
      { rel: 'stylesheet', href: pageCss },
      { rel: 'stylesheet', href: v2Css },
    ],
  }),
  component: PersonalDatesPage,
  errorComponent: LinkUnavailable,
  notFoundComponent: LinkUnavailable,
});

const asDate = (d: string) => new Date(`${d}T12:00:00-03:00`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).format(asDate(d));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (d: string) => cap(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', ''));
const mon3 = (d: string) => fmt(d, { month: 'short' }).replace('.', '');
const wk3 = (d: string) => fmt(d, { weekday: 'short' }).replace('.', '');
const T = (s: Slot) => (s === 'almoco' ? 'Almoço' : 'Jantar');
const SLOTS: Slot[] = ['almoco', 'jantar'];

function PersonalDatesPage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery(baseQ(token));
  if (data.error) return <LinkUnavailable />;
  return <DatesPage token={token} base={data} />;
}

function post(token: string, body: Record<string, unknown>) {
  return fetch('/api/public/personal-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }), keepalive: true }).catch(() => undefined);
}
function openUrl(url: string) {
  const w = window.open(url, '_blank');
  if (w) w.opener = null; else window.location.assign(url);
}

const WA = () => <svg className="wa" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" /></svg>;

function DatesPage({ token, base }: { token: string; base: PersonalDateBase }) {
  const house = base.origin;
  const full = useQuery(fullQ(token));
  const [asked, setAsked] = useState<Asked[]>(base.asked ?? []);
  const [view, setView] = useState<'main' | 'cal'>('main');
  const [t0] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0));
  useEffect(() => { if (full.data) (window as unknown as { __kpdTurnsMs?: number }).__kpdTurnsMs = Math.round(performance.now() - t0); }, [full.data, t0]);

  useEffect(() => {
    const w = window as unknown as { __kpdOpened?: Set<string> };
    w.__kpdOpened ??= new Set();
    if (w.__kpdOpened.has(token)) return;
    w.__kpdOpened.add(token);
    const o = new URLSearchParams(window.location.search).get('o');
    void post(token, { action: 'abriu', detail: o === 'email' ? 'email' : 'whatsapp' });
  }, [token]);

  const tap = (date: string, slot: Slot, status: Availability, kind: 'data_pedida' | 'alternativa' | 'calendario') => {
    const queue = status === 'interesse';
    openUrl(pickUrl(base.firstName, house, date, slot, queue));
    setAsked(a => [{ date, slot, queue }, ...a]);
    void post(token, queue ? { action: 'entrou_fila', date, slot } : { action: 'escolheu_data', date, slot, detail: kind });
  };
  const isAsked = (date: string, slot: Slot) => asked.find(a => a.date === date && a.slot === slot);

  const Header = ({ back }: { back?: boolean }) => (
    <header className="v2-head">
      <span className="v2-circle" aria-hidden="true" /><span className="v2-dot" aria-hidden="true" />
      {back ? (
        <div className="v2-calhead"><button type="button" className="v2-back" onClick={() => { setView('main'); window.scrollTo(0, 0); }} aria-label="Voltar"><ArrowLeft size={22} /></button><h1 className="v2-caltitle">Calendário</h1></div>
      ) : (<>
        <p className="v2-brand">Kids Point</p>
        <h1 className="v2-hi">Oi, {base.firstName}!</h1>
        <p className="v2-unit"><MapPin size={15} aria-hidden="true" />{UNIT_NAME[house]}</p>
      </>)}
    </header>
  );

  const BigTurns = ({ day, kind, small }: { day: DayTurns; kind: 'data_pedida' | 'calendario'; small?: boolean }) => (
    <div className={`v2-big${small ? ' small' : ''}`}>
      {SLOTS.map(s => {
        const st = day[s]; const Icon = s === 'almoco' ? Sun : Moon; const mine = isAsked(day.date, s);
        if (mine) return <button key={s} type="button" className="v2-turn asked" onClick={() => openUrl(pickUrl(base.firstName, house, day.date, s, mine.queue))}><span className="v2-you">✓ Você pediu</span><span className="v2-tname">{T(s)}</span><span className="v2-tsub u">Abrir WhatsApp de novo</span></button>;
        if (st === 'ocupado') return <div key={s} className="v2-turn off"><Icon size={22} strokeWidth={2} aria-hidden="true" /><span className="v2-tname">{T(s)}</span><span className="v2-tsub">Ocupado</span></div>;
        if (st === 'interesse') return <button key={s} type="button" className="v2-turn fila" onClick={() => tap(day.date, s, st, kind)}><Icon size={22} strokeWidth={2} aria-hidden="true" /><span className="v2-tname">{T(s)}</span><span className="v2-tsub">Entrar na fila</span></button>;
        return <button key={s} type="button" className="v2-turn free" onClick={() => tap(day.date, s, st, kind)}><WA /><Icon size={22} strokeWidth={2} aria-hidden="true" /><span className="v2-tname">{T(s)}</span><span className="v2-tsub">Livre · pedir agora</span>{day.low[s] && <em className="v2-low">Menor investimento</em>}</button>;
      })}
    </div>
  );
  const anyAsked = (dates: string[]) => asked.some(a => dates.includes(a.date));
  const AskedNote = () => <p className="v2-note"><MessageCircle size={18} aria-hidden="true" />Nossa equipe continua com você no WhatsApp. Se não enviou a mensagem, toque em "Abrir WhatsApp de novo".</p>;

  if (view === 'cal') return <div className="v2"><Header back /><Calendar token={token} base={base} BigTurns={BigTurns} anyAsked={anyAsked} AskedNote={AskedNote} /></div>;

  const d = full.data;
  const req = base.requestedDate;
  const summary = (r: DayTurns) => { const a = r.almoco === 'disponivel', j = r.jantar === 'disponivel'; return a && j ? 'Almoço e jantar livres' : a ? 'Almoço livre' : j ? 'Jantar livre' : r.almoco === 'ocupado' && r.jantar === 'ocupado' ? 'Data ocupada' : 'Entrar na fila'; };

  return (
    <div className="v2">
      <Header />
      <main className="v2-main">
        {req && (
          <section className="v2-req">
            <div className="v2-mini"><span>{mon3(req).toUpperCase()}</span><b>{Number(req.slice(8, 10))}</b></div>
            <div><h2 className="v2-date">{longDate(req)}</h2>
              {!d ? <span className="v2-sk line" /> : d.state === 'ready' && d.requested ? <p className={`v2-sum${summary(d.requested) === 'Data ocupada' ? ' busy' : ''}`}>{summary(d.requested)}</p>
                : d.state === 'unopened' ? <p className="v2-sum busy">O calendário dessa data ainda não abriu</p>
                : d.state === 'closed' ? <p className="v2-sum busy">Não atendemos nessa data</p>
                : d.state === 'unavailable' ? <p className="v2-sum busy">Vamos confirmar com a equipe</p> : null}
            </div>
          </section>
        )}
        {!d && <div className="v2-big"><span className="v2-sk turn" /><span className="v2-sk turn" /></div>}
        {d?.state === 'ready' && d.requested && <BigTurns day={d.requested} kind="data_pedida" />}
        {d?.state === 'unavailable' && <a className="v2-wabtn" href={base.fallbackUrl} target="_blank" rel="noopener noreferrer"><WA />Falar no WhatsApp da {UNIT_NAME[house]}</a>}
        {d?.state === 'ready' && req && anyAsked([req]) && <AskedNote />}

        {(!d || d.options.length > 0) && <h3 className="v2-h3">Outras opções</h3>}
        {!d && [0, 1, 2].map(i => <div key={i} className="v2-row"><span className="v2-sk col" /><span className="v2-sk opt" /><span className="v2-sk opt" /></div>)}
        {d?.options.map(o => (
          <div key={o.date} className="v2-row">
            <div className="v2-col"><span className="w">{wk3(o.date)}</span><b>{Number(o.date.slice(8, 10))}</b><span className="m">{mon3(o.date)}</span></div>
            <div className="v2-opts">
              {SLOTS.map(s => {
                const st = o[s]; const Icon = s === 'almoco' ? Sun : Moon; const mine = isAsked(o.date, s);
                const label = <span className="v2-oname"><Icon size={14} aria-hidden="true" />{T(s)}</span>;
                if (mine) return <button key={s} type="button" className="v2-opt asked" onClick={() => openUrl(pickUrl(base.firstName, house, o.date, s, mine.queue))}>{label}<span className="v2-ost">✓ Você pediu</span></button>;
                if (st === 'ocupado') return <div key={s} className="v2-opt off">{label}<span className="v2-ost">Ocupado</span></div>;
                return <button key={s} type="button" className={`v2-opt ${st === 'interesse' ? 'fila' : 'free'}`} onClick={() => tap(o.date, s, st, 'alternativa')}>{label}<span className="v2-ost">{st === 'interesse' ? 'Entrar na fila' : 'Livre'}</span>{o.low[s] && <em className="v2-low">Menor investimento</em>}</button>;
              })}
            </div>
          </div>
        ))}
        {d && anyAsked(d.options.map(o => o.date)) && !(req && anyAsked([req])) && <AskedNote />}
        <button type="button" className="v2-callink" onClick={() => { setView('cal'); window.scrollTo(0, 0); void post(token, { action: 'abriu_calendario' }); }}><CalendarDays size={18} aria-hidden="true" />Ver calendário completo</button>
        <p className="v2-foot">Nada é reservado aqui. A reserva acontece com o sinal pago e o contrato fechado.</p>
      </main>
    </div>
  );
}

const addMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
function Calendar({ token, base, BigTurns, anyAsked, AskedNote }: { token: string; base: PersonalDateBase; BigTurns: (p: { day: DayTurns; kind: 'calendario'; small?: boolean }) => React.ReactElement; anyAsked: (d: string[]) => boolean; AskedNote: () => React.ReactElement }) {
  const startMonth = (base.requestedDate && base.requestedDate <= base.horizon ? base.requestedDate : base.today).slice(0, 7);
  const [month, setMonth] = useState(startMonth);
  const [sel, setSel] = useState<string | null>(base.requestedDate);
  const qc = useQueryClient();
  const q = useQuery(monthQ(token, month));
  useEffect(() => { const next = addMonth(month, 1); if (next <= base.horizon.slice(0, 7)) void qc.prefetchQuery(monthQ(token, next)); }, [month, qc, token, base.horizon]);
  const days: MonthDay[] = q.data?.days ?? [];
  const lead = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const selDay = useMemo(() => days.find(d => d.date === sel && !('off' in d)) as DayTurns | undefined, [days, sel]);
  const title = cap(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`)));
  const minM = base.today.slice(0, 7), maxM = base.horizon.slice(0, 7);
  return (
    <main className="v2-main">
      <div className="v2-monthnav">
        <button type="button" aria-label="Mês anterior" disabled={month <= minM} onClick={() => setMonth(addMonth(month, -1))}><ChevronLeft /></button>
        <h2>{title}</h2>
        <button type="button" aria-label="Próximo mês" disabled={month >= maxM} onClick={() => setMonth(addMonth(month, 1))}><ChevronRight /></button>
      </div>
      <div className="v2-grid" role="grid">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((l, i) => <span key={i} className="v2-wd">{l}</span>)}
        {Array.from({ length: lead }).map((_, i) => <span key={`e${i}`} />)}
        {!q.data && Array.from({ length: 30 }).map((_, i) => <span key={`s${i}`} className="v2-sk day" />)}
        {days.map(d => {
          const n = Number(d.date.slice(8, 10));
          if ('off' in d) return <span key={d.date} className="v2-day dim">{n}</span>;
          const free = d.almoco === 'disponivel' || d.jantar === 'disponivel', busy = d.almoco === 'ocupado' && d.jantar === 'ocupado';
          const cls = free ? 'g' : busy ? 'r' : 'y';
          return <button key={d.date} type="button" className={`v2-day ${cls}${d.date === base.requestedDate ? ' mine' : ''}${d.date === sel ? ' sel' : ''}`} onClick={() => setSel(d.date)} aria-pressed={d.date === sel}>{n}<i /></button>;
        })}
      </div>
      <ul className="v2-legend"><li><i className="g" />Livre</li><li><i className="y" />Fila</li><li><i className="r" />Ocupado</li><li><i className="mine" />Sua data</li></ul>
      {selDay && <section className="v2-selcard"><h3 className="v2-h3">{longDate(selDay.date)}</h3><BigTurns day={selDay} kind="calendario" small />{anyAsked([selDay.date]) && <AskedNote />}</section>}
      <p className="v2-foot">Nada é reservado aqui. A reserva acontece com o sinal pago e o contrato fechado.</p>
    </main>
  );
}
