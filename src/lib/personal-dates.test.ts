import { describe, it, expect } from 'vitest';
import { availability, priceFor, horizon, inWindow, buildOptions, isAllowedForm, whatsappUrl, orderDaySlots, type CalendarEvent, type CalendarSet } from './personal-dates';
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
  it('turno disponível vem antes da pré-reserva no mesmo dia', () => { const options = buildOptions('2027-01-23','bosque',{...empty,bosque:{closed:[],interest:[event('12:00','14:00')]}},[],'2026-11-05').filter(o => o.house === 'bosque' && o.date === '2027-01-23'); expect(orderDaySlots(options).map(o => `${o.slot}:${o.status}`)).toEqual(['jantar:disponivel','almoco:interesse']); });
  it('limite de dez meses', () => expect(horizon('2026-11-05')).toBe('2027-09-05'));
  it('exclui hoje e passado', () => { expect(inWindow('2026-11-05','2026-11-05')).toBe(false); expect(inWindow('2026-11-04','2026-11-05')).toBe(false); });
  it('exclui além de dez meses', () => expect(inWindow('2027-09-06','2026-11-05')).toBe(false));
  it('prioriza mesma data/casa depois outra casa', () => expect(buildOptions('2027-01-23','bosque',empty,[],'2026-11-05').slice(0,4).map(o => `${o.date}:${o.house}`)).toEqual(['2027-01-23:bosque','2027-01-23:bosque','2027-01-23:vila','2027-01-23:vila']));
  it('pedido de fim de semana nunca sugere segunda a quinta', () => expect(buildOptions('2027-01-23','bosque',empty,[],'2026-11-05').every(o => [0,5,6].includes(new Date(`${o.date}T12:00:00Z`).getUTCDay()))).toBe(true));
  it('pré-reserva entra como sugestão sem selo', () => { const cal = { ...empty, bosque: { closed: [], interest: [event('12:00','14:00')] } }; const option = buildOptions('2027-01-23','bosque',cal,[],'2026-11-05').find(o => o.house === 'bosque' && o.date === '2027-01-23' && o.slot === 'almoco'); expect(option?.status).toBe('interesse'); expect(option?.cheaper).toBe(false); });
  it('06/12 Bosque sugere 04/12 jantar pré-reservado', () => { const cal = { ...empty, bosque: { closed: [], interest: [{start:{dateTime:'2026-12-04T19:00:00-03:00'},end:{dateTime:'2026-12-04T23:00:00-03:00'}}] } }; expect(buildOptions('2026-12-06','bosque',cal,[],'2026-11-05').find(o => o.house === 'bosque' && o.date === '2026-12-04' && o.slot === 'jantar')?.status).toBe('interesse'); });
  it('ocupados continuam fora das sugestões', () => { const cal = { ...empty, bosque: { closed: [event('12:00','14:00')], interest: [] } }; expect(buildOptions('2027-01-23','bosque',cal,[],'2026-11-05').some(o => o.house === 'bosque' && o.date === '2027-01-23' && o.slot === 'almoco')).toBe(false); });
  it('pedido semanal não tem selo', () => expect(buildOptions('2027-01-20','bosque',empty,[],'2026-11-05').some(o => o.cheaper)).toBe(false));
  it('faixa menor que nobre tem selo', () => expect(buildOptions('2027-01-23','bosque',empty,[],'2026-11-05').find(o => o.date === '2027-01-24' && o.slot === 'jantar')?.cheaper).toBe(true));
  it('mais barato respeita pedido domingo jantar', () => expect(buildOptions('2027-01-24','bosque',empty,[],'2026-11-05','all','jantar').some(o => o.cheaper)).toBe(false));
  it('links somente formulário teste', () => { expect(isAllowedForm('bs-orcamento-teste')).toBe(true); expect(isAllowedForm('bs-kids-day')).toBe(false); expect(isAllowedForm('bs-landingprincipal')).toBe(false); });
  it('WhatsApp da casa escolhida', () => { expect(whatsappUrl('André','bosque')).toContain('5511914454455'); expect(whatsappUrl('André','vila')).toContain('5511937123020'); });
  it('almoço ou jantar vem por extenso na mensagem', () => { const url = whatsappUrl('André','vila','2027-01-23','ambos'); expect(decodeURIComponent(url.slice(url.indexOf('text=') + 5))).toBe('Olá! Sou André. Quero falar sobre uma data: 23/01/2027, almoço ou jantar, Vila Mariana.'); });
  const recesso = [{ start_date: '2026-12-21', end_date: '2027-01-05', name: 'Recesso de fim de ano' }];
  const inRecess = (d: string) => d >= '2026-12-21' && d <= '2027-01-05';
  it('recesso: pedido 26/12/2026 não oferece nenhuma data entre 21/12 e 05/01 e acha datas antes e depois', () => { const o = buildOptions('2026-12-26','bosque',empty,[],'2026-11-05','all',null,recesso); expect(o.some(x => inRecess(x.date))).toBe(false); expect(o.some(x => x.date < '2026-12-21')).toBe(true); expect(o.some(x => x.date > '2027-01-05')).toBe(true); });
  it('recesso: 05/01/2027 é bloqueado e 06/01/2027 volta ao normal', () => { expect(buildOptions('2027-01-05','vila',empty,[],'2026-11-05','all',null,recesso).some(x => inRecess(x.date))).toBe(false); expect(buildOptions('2027-01-06','vila',empty,[],'2026-11-05','all',null,recesso).filter(x => x.date === '2027-01-06')).toHaveLength(4); });
  it('recesso bloqueia mesmo com pré-reserva na agenda', () => { const cal = { ...empty, bosque: { closed: [], interest: [{start:{dateTime:'2026-12-19T12:00:00-03:00'},end:{dateTime:'2026-12-19T16:00:00-03:00'}}, {start:{dateTime:'2026-12-26T12:00:00-03:00'},end:{dateTime:'2026-12-26T16:00:00-03:00'}}] } }; expect(buildOptions('2026-12-19','bosque',cal,[],'2026-11-05','all',null,recesso).some(x => inRecess(x.date))).toBe(false); });
});describe('Ordem das sugestões em data nobre', () => {
  const seq = (req: string) => [...new Set(buildOptions(req,'bosque',empty,[],'2026-11-05').filter(o => o.house === 'bosque').map(o => `${o.date}:${o.slot}`))];
  it('sábado: mesmo fim de semana, depois nobres ±1 e ±2 (anterior antes no empate), depois sexta/domingo jantar', () => {
    expect(seq('2027-01-23').slice(0, 14)).toEqual([
      '2027-01-23:almoco','2027-01-23:jantar','2027-01-24:almoco',
      '2027-01-16:almoco','2027-01-16:jantar','2027-01-17:almoco',
      '2027-01-30:almoco','2027-01-30:jantar','2027-01-31:almoco',
      '2027-01-09:almoco','2027-01-09:jantar','2027-01-10:almoco',
      '2027-02-06:almoco','2027-02-06:jantar',
    ]);
    const s = seq('2027-01-23');
    expect(s.slice(s.indexOf('2027-02-07:almoco') + 1, s.indexOf('2027-02-07:almoco') + 4)).toEqual(['2027-01-22:almoco','2027-01-22:jantar','2027-01-24:jantar']);
  });
  it('domingo jantar (intermediário) começa pelos nobres do mesmo fim de semana', () => expect(seq('2027-01-24').slice(0, 4)).toEqual(['2027-01-24:almoco','2027-01-24:jantar','2027-01-23:almoco','2027-01-23:jantar']));
});
