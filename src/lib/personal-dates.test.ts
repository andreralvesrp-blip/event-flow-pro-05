import { describe, it, expect } from 'vitest';
import { availability, priceFor, horizon, inWindow, buildOptions, isAllowedForm, whatsappUrl, type CalendarEvent, type CalendarSet } from './personal-dates';
const event = (start: string, end: string): CalendarEvent => ({ start: { dateTime: `2027-01-23T${start}:00-03:00` }, end: { dateTime: `2027-01-23T${end}:00-03:00` } });
const empty: CalendarSet = { bosque: { closed: [], interest: [] }, vila: { closed: [], interest: [] } };
describe('Turnos', () => {
  it('antes das 15h ocupa almoço', () => expect(availability('2027-01-23', [event('14:59','17:30')], []).almoco).toBe('ocupado'));
  it('às 15h ocupa jantar e bloqueia almoço', () => expect(availability('2027-01-23', [event('15:00','18:00')], [])).toEqual({ almoco: 'ocupado', jantar: 'ocupado' }));
  it('antes das 17h bloqueia almoço', () => expect(availability('2027-01-23', [event('16:59','20:00')], []).almoco).toBe('ocupado'));
  it('às 17h não bloqueia almoço', () => expect(availability('2027-01-23', [event('17:00','20:00')], []).almoco).toBe('disponivel'));
  it('almoço até 17h30 não bloqueia jantar', () => expect(availability('2027-01-23', [event('12:00','17:30')], []).jantar).toBe('disponivel'));
  it('almoço após 17h30 bloqueia jantar', () => expect(availability('2027-01-23', [event('12:00','17:31')], []).jantar).toBe('ocupado'));
  it('duas festas fechadas esgotam ambos turnos', () => expect(availability('2027-01-23', [event('10:00','12:00'), event('13:00','14:00')], [])).toEqual({ almoco: 'ocupado', jantar: 'ocupado' }));
  it('pré-reserva aplica interesse nos mesmos limites', () => expect(availability('2027-01-23', [], [event('15:00','18:00')])).toEqual({ almoco: 'interesse', jantar: 'interesse' }));
  it('fechada prevalece sobre interesse', () => expect(availability('2027-01-23', [event('12:00','14:00')], [event('12:00','14:00')]).almoco).toBe('ocupado'));
  it('evento de dia todo não bloqueia nenhum turno', () => { const e = { start: { date: '2027-01-23' }, end: { date: '2027-01-24' } }; expect(availability('2027-01-23',[e],[e])).toEqual({ almoco: 'disponivel', jantar: 'disponivel' }); });
});
describe('Preços', () => {
  it('sábado almoço 11030', () => expect(priceFor('2027-01-23','almoco',[])).toBe(11030));
  it('sábado jantar 11030', () => expect(priceFor('2027-01-23','jantar',[])).toBe(11030));
  it('domingo almoço 11030', () => expect(priceFor('2027-01-24','almoco',[])).toBe(11030));
  it('domingo jantar 7830', () => expect(priceFor('2027-01-24','jantar',[])).toBe(7830));
  it('sexta 7830', () => expect(priceFor('2027-01-22','almoco',[])).toBe(7830));
  it('segunda a quinta 6830', () => { for (const date of ['2027-01-18','2027-01-19','2027-01-20','2027-01-21']) expect(priceFor(date,'jantar',[])).toBe(6830); });
  it('feriado em dia útil 7830', () => expect(priceFor('2027-04-21','almoco',['2027-04-21'])).toBe(7830));
  it('feriado sábado mantém 11030', () => expect(priceFor('2027-05-01','jantar',['2027-05-01'])).toBe(11030));
});
describe('Sugestões e segurança', () => {
  it('limite de dez meses', () => expect(horizon('2026-11-05')).toBe('2027-09-05'));
  it('exclui hoje e passado', () => { expect(inWindow('2026-11-05','2026-11-05')).toBe(false); expect(inWindow('2026-11-04','2026-11-05')).toBe(false); });
  it('exclui além de dez meses', () => expect(inWindow('2027-09-06','2026-11-05')).toBe(false));
  it('prioriza mesma data/casa depois outra casa', () => expect(buildOptions('2027-01-23','bosque',empty,[],'2026-11-05').slice(0,4).map(o => `${o.date}:${o.house}`)).toEqual(['2027-01-23:bosque','2027-01-23:bosque','2027-01-23:vila','2027-01-23:vila']));
  it('pedido de fim de semana nunca sugere segunda a quinta', () => expect(buildOptions('2027-01-23','bosque',empty,[],'2026-11-05').every(o => [0,5,6].includes(new Date(`${o.date}T12:00:00Z`).getUTCDay()))).toBe(true));
  it('interesse não entra como sugestão', () => { const cal = { ...empty, bosque: { closed: [], interest: [event('12:00','14:00')] } }; expect(buildOptions('2027-01-23','bosque',cal,[],'2026-11-05').some(o => o.house === 'bosque' && o.date === '2027-01-23' && o.slot === 'almoco')).toBe(false); });
  it('pedido semanal não tem selo', () => expect(buildOptions('2027-01-20','bosque',empty,[],'2026-11-05').some(o => o.cheaper)).toBe(false));
  it('faixa menor que nobre tem selo', () => expect(buildOptions('2027-01-23','bosque',empty,[],'2026-11-05').find(o => o.date === '2027-01-24' && o.slot === 'jantar')?.cheaper).toBe(true));
  it('mais barato respeita pedido domingo jantar', () => expect(buildOptions('2027-01-24','bosque',empty,[],'2026-11-05','all','jantar').some(o => o.cheaper)).toBe(false));
  it('links somente formulário teste', () => { expect(isAllowedForm('bs-orcamento-teste')).toBe(true); expect(isAllowedForm('bs-kids-day')).toBe(false); expect(isAllowedForm('bs-landingprincipal')).toBe(false); });
  it('WhatsApp da casa escolhida', () => { expect(whatsappUrl('André','bosque')).toContain('5511914454455'); expect(whatsappUrl('André','vila')).toContain('5511937123020'); });
});