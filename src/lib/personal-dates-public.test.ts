import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ form: 'bs-orcamento-teste', desired: '2027-01-23', inserts: [] as Array<Record<string,unknown>>, status: 'ready', closed: [] as Array<{ start: { dateTime: string }; end: { dateTime: string } }>, interest: [] as Array<{ start: { dateTime: string }; end: { dateTime: string } }>, existing: [] as Array<{ id: string }> }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  const results: Record<string,unknown> = {
    date_personal_links: { id: 'link', opportunity_id: 'op', tenant_id: 'tenant' },
    opportunities: { id: 'op', tenant_id: 'tenant', unit_id: 'unit', form_slug: mocks.form, desired_date: mocks.desired, desired_slot: null, client: { full_name: 'André Alves' } },
    units: { slug: 'bosque-da-saude' }, date_holidays: [], date_closures: [{ start_date: '2026-12-21', end_date: '2027-01-05', name: 'Recesso de fim de ano' }], date_interactions: mocks.existing as unknown,
  };
  const builder = { select: () => builder, eq: () => builder, is: () => builder, gte: () => builder, limit: () => builder, in: () => builder, order: () => builder, maybeSingle: async () => ({ data: results[table], error: null }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: results[table], error: null }).then(resolve), insert: async (data: Record<string,unknown>) => { mocks.inserts.push(data); return { error: null }; } };
  return builder;
} } }));
vi.mock('./personal-calendar.server', () => ({ tokenHash: async () => 'hash', loadCalendars: async () => {
  if (mocks.status === 'unavailable') throw new Error('missing account');
  return { bosque: { closed: mocks.closed, interest: mocks.interest }, vila: { closed: [], interest: mocks.interest } };
} }));
import { handlePersonalDates } from './personal-dates-public.server';
const token = 'a'.repeat(43);
const request = (body: Record<string,unknown>) => new Request('https://example.com/api/public/personal-dates', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify({ token, ...body }) });
describe('Endpoint pessoal isolado', () => {
  beforeEach(() => { mocks.form = 'bs-orcamento-teste'; mocks.desired = '2027-01-23'; mocks.inserts = []; mocks.existing = []; mocks.status = 'ready'; mocks.closed = []; mocks.interest = []; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T13:00:00Z')); });
  it('GET não registra ações', async () => { const r = await handlePersonalDates(new Request(`https://example.com/api/public/personal-dates?token=${token}&action=abriu`)); expect(r.status).toBe(405); expect(mocks.inserts.length).toBe(0); });
  it('formulário atual não permite página', async () => { mocks.form = 'bs-landingprincipal'; const r = await handlePersonalDates(request({ action: 'abriu' })); expect(r.status).toBe(404); });
  it('outra origem é rejeitada', async () => { const r = await handlePersonalDates(new Request('https://example.com/api/public/personal-dates', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'abriu' }) })); expect(r.status).toBe(403); });
  it('abertura pelo e-mail grava origem e-mail', async () => { await handlePersonalDates(request({ action: 'abriu', detail: 'email' })); expect(mocks.inserts[0]).toMatchObject({ action: 'abriu', detail: 'email' }); });
  it('abertura sem parâmetro grava origem WhatsApp', async () => { await handlePersonalDates(request({ action: 'abriu' })); expect(mocks.inserts[0]).toMatchObject({ action: 'abriu', detail: 'whatsapp' }); });
  it('viu_opcao não é mais gravado', async () => { const r = await handlePersonalDates(request({ action: 'viu_opcao', date: '2027-01-23', slot: 'almoco' })); expect(r.status).toBe(400); expect(mocks.inserts).toHaveLength(0); });
  it('escolha grava data, turno e tipo, sempre na unidade da oportunidade', async () => { await handlePersonalDates(request({ action: 'escolheu_data', date: '2027-01-23', slot: 'jantar', detail: 'data_pedida' })); expect(mocks.inserts[0]).toMatchObject({ action: 'escolheu_data', house: 'bosque', party_date: '2027-01-23', slot: 'jantar', detail: 'data_pedida' }); });
  it('fila não duplica', async () => { mocks.existing = [{ id: 'ja' }]; await handlePersonalDates(request({ action: 'entrou_fila', date: '2027-01-22', slot: 'jantar' })); expect(mocks.inserts).toHaveLength(0); });
  it('abriu_calendario é gravado', async () => { await handlePersonalDates(request({ action: 'abriu_calendario' })); expect(mocks.inserts[0]?.action).toBe('abriu_calendario'); });
  it('retorna só primeiro nome e 3 opções da mesma unidade', async () => { mocks.desired = '2027-03-13'; const body = await (await handlePersonalDates(request({}))).json(); expect(body.firstName).toBe('André'); expect(body.phone).toBeUndefined(); expect(body.options).toHaveLength(3); expect(JSON.stringify(body)).not.toContain('price'); });
  it('recesso informa estado closed', async () => { mocks.desired = '2026-12-26'; const body = await (await handlePersonalDates(request({}))).json(); expect(body.state).toBe('closed'); });
  it('falha das agendas responde unavailable', async () => { mocks.status = 'unavailable'; const body = await (await handlePersonalDates(request({}))).json(); expect(body.state).toBe('unavailable'); });
});
