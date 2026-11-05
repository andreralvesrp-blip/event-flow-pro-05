import { addDays, addMonths, format, parseISO, getDay } from 'date-fns';

export type House = 'bosque' | 'vila';
export type Slot = 'almoco' | 'jantar';
/** "ambos" = almoço ou jantar: os dois turnos estão livres na mesma data e casa. */
export type Turno = Slot | 'ambos';
export type Availability = 'disponivel' | 'interesse' | 'ocupado';
export type CalendarEvent = { start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }; status?: string };
export type Option = { house: House; date: string; slot: Slot; status: Availability; price: number; cheaper: boolean };
export const orderDaySlots = (options: Option[]) => [...options].sort((a, b) => Number(a.status === 'interesse') - Number(b.status === 'interesse'));
export const HOUSES = {
  bosque: { name: 'Bosque da Saúde', address: 'Rua Tiquatira, 394', whatsapp: '5511914454455' },
  vila: { name: 'Vila Mariana', address: 'Rua Padre Machado, 1161', whatsapp: '5511937123020' },
};
export const INITIAL_HOLIDAYS = [
  { holiday_date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' },
  { holiday_date: '2026-12-25', name: 'Natal' },
  { holiday_date: '2027-01-01', name: 'Confraternização Universal' },
  { holiday_date: '2027-04-21', name: 'Tiradentes' },
  { holiday_date: '2027-05-01', name: 'Dia do Trabalho' },
];
export const dayString = (d: Date) => format(d, 'yyyy-MM-dd');
export function saoPauloToday(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-${p.find(x => x.type === 'day')?.value}`;
}
export const horizon = (today: string) => dayString(addMonths(parseISO(today), 10));
export const inWindow = (date: string, today: string) => date > today && date <= horizon(today);
export function priceFor(date: string, slot: Slot, holidays: string[]) {
  const day = getDay(parseISO(date));
  if (day === 6 || (day === 0 && slot === 'almoco')) return 11030;
  if (day === 5 || day === 0 || holidays.includes(date)) return 7830;
  return 6830;
}
function localTimestamp(value: string) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error('Evento sem fuso horário válido');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
function slotsFor(event: CalendarEvent, date: string): Slot[] {
  if (event.status === 'cancelled') return [];
  // Eventos de dia todo (lembretes, itens) nunca bloqueiam turnos.
  if (event.start.date || event.end.date) return [];
  if (!event.start.dateTime || !event.end.dateTime) throw new Error('Evento incompleto');
  const start = localTimestamp(event.start.dateTime), end = localTimestamp(event.end.dateTime);
  if (Date.parse(event.end.dateTime) <= Date.parse(event.start.dateTime)) throw new Error('Evento com duração inválida');
  if (date < start.date || date > end.date || (date === end.date && end.minutes === 0)) return [];
  if (date !== start.date) return ['almoco', 'jantar'];
  const slots: Slot[] = [start.minutes < 900 ? 'almoco' : 'jantar'];
  if (start.minutes < 900 && (end.date > date || end.minutes > 1050)) slots.push('jantar');
  if (start.minutes >= 900 && start.minutes < 1020) slots.push('almoco');
  return slots;
}
export function availability(date: string, closed: CalendarEvent[], interest: CalendarEvent[]): Record<Slot, Availability> {
  const result: Record<Slot, Availability> = { almoco: 'disponivel', jantar: 'disponivel' };
  for (const e of interest) for (const s of slotsFor(e, date)) result[s] = 'interesse';
  const parties = closed.map(e => slotsFor(e, date)).filter(s => s.length > 0);
  for (const slots of parties) for (const s of slots) result[s] = 'ocupado';
  if (parties.length >= 2) result.almoco = result.jantar = 'ocupado';
  return result;
}
export type CalendarSet = Record<House, { closed: CalendarEvent[]; interest: CalendarEvent[] }>;
export function buildOptions(requested: string, origin: House, calendars: CalendarSet, holidays: string[], today: string, mode: 'all' | 'origin' | 'other' = 'all', requestedSlot?: Slot | null) {
  const other: House = origin === 'bosque' ? 'vila' : 'bosque';
  const weekday = getDay(parseISO(requested));
  const isWeek = weekday >= 1 && weekday <= 4;
  const baseline = priceFor(requested, requestedSlot ?? 'almoco', holidays);
  const candidate: Array<{ date: string; house: House; slot: Slot }> = [];
  const push = (date: string, houses: House[], slots: Slot[] = ['almoco', 'jantar']) => {
    for (const house of houses) for (const slot of slots) candidate.push({ date, house, slot });
  };
  push(requested, [origin, other]);
  const base = parseISO(requested);
  if (isWeek) {
    for (let n = 1; n <= 14; n++) for (const delta of [-n, n]) {
      const d = addDays(base, delta), w = getDay(d);
      if (w >= 1 && w <= 4) push(dayString(d), [origin, other]);
    }
  } else {
    const saturday = addDays(base, weekday === 0 ? -1 : weekday === 5 ? 1 : weekday === 6 ? 0 : (6 - weekday));
    for (const d of [saturday, addDays(saturday, 1)]) if (dayString(d) !== requested) push(dayString(d), [origin, other]);
    for (let n = 1; n <= 2; n++) for (const side of [-1, 1]) {
      const sat = addDays(saturday, side * n * 7);
      push(dayString(sat), [origin, other]);
      push(dayString(addDays(sat, 1)), [origin, other], ['almoco']);
    }
    for (let n = 0; n <= 21; n++) for (const side of n === 0 ? [1] : [-1, 1]) {
      const d = addDays(base, side * n), w = getDay(d);
      if (w === 5) push(dayString(d), [origin, other]);
      if (w === 0) push(dayString(d), [origin, other], ['jantar']);
    }
  }
  const seen = new Set<string>();
  const options: Option[] = [];
  for (const c of candidate) {
    const key = `${c.date}:${c.house}:${c.slot}`;
    if (seen.has(key) || !inWindow(c.date, today)) continue;
    seen.add(key);
    if ((mode === 'origin' && (c.house !== origin || c.date === requested)) || (mode === 'other' && c.house !== other)) continue;
    const status = availability(c.date, calendars[c.house].closed, calendars[c.house].interest)[c.slot];
    if (status === 'ocupado') continue;
    const price = priceFor(c.date, c.slot, holidays);
    options.push({ ...c, status, price, cheaper: status === 'disponivel' && !isWeek && price < baseline });
  }
  return options;
}
export function isAllowedForm(slug: string | null) { return slug === 'bs-orcamento-teste'; }
export function whatsappUrl(firstName: string, house: House, date?: string | null, slot?: Turno | null, queue = false) {
  const label = date ? format(parseISO(date), 'dd/MM/yyyy') : 'a confirmar';
  const text = `Olá! Sou ${firstName}. ${queue ? 'Quero entrar na fila (não é reserva nem pré-reserva)' : 'Quero falar sobre uma data'}: ${label}, ${slot === 'almoco' ? 'almoço' : slot === 'jantar' ? 'jantar' : slot === 'ambos' ? 'almoço ou jantar' : 'turno a confirmar'}, ${HOUSES[house].name}.`;
  return `https://wa.me/${HOUSES[house].whatsapp}?text=${encodeURIComponent(text)}`;
}