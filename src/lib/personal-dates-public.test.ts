import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ form: 'bs-orcamento-teste', inserts: [] as Array<Record<string,unknown>>, status: 'ready' }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  const results: Record<string,unknown> = {
    date_personal_links: { id: 'link', opportunity_id: 'op', tenant_id: 'tenant' },
    opportunities: { id: 'op', tenant_id: 'tenant', unit_id: 'unit', form_slug: mocks.form, desired_date: '2027-01-23', desired_slot: null, client: { full_name: 'André Alves' } },
    units: { slug: 'bosque-da-saude' }, date_holidays: [],
  };
  const builder = { select: () => builder, eq: () => builder, is: () => builder, maybeSingle: async () => ({ data: results[table], error: null }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: results[table], error: null }).then(resolve), insert: async (data: Record<string,unknown>) => { mocks.inserts.push(data); return { error: null }; } };
  return builder;
} } }));
vi.mock('./personal-calendar.server', () => ({ tokenHash: async () => 'hash', loadCalendars: async () => {
  if (mocks.status === 'unavailable') throw new Error('missing account');
  return { bosque: { closed: [], interest: [] }, vila: { closed: [], interest: [] } };
} }));
import { handlePersonalDates } from './personal-dates-public.server';
const token = 'a'.repeat(43);
const request = (body: Record<string,unknown>) => new Request('https://example.com/api/public/personal-dates', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify({ token, ...body }) });
describe('Endpoint pessoal isolado', () => {
  beforeEach(() => { mocks.form = 'bs-orcamento-teste'; mocks.inserts = []; mocks.status = 'ready'; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T13:00:00Z')); });
  it('GET não registra ações', async () => { const r = await handlePersonalDates(new Request(`https://example.com/api/public/personal-dates?token=${token}&action=abriu`)); expect(r.status).toBe(405); expect(mocks.inserts.length).toBe(0); });
  it('formulário atual não permite página nem gravações', async () => { mocks.form = 'bs-landingprincipal'; const r = await handlePersonalDates(request({ action: 'abriu' })); expect(r.status).toBe(404); expect(mocks.inserts.length).toBe(0); });
  it('outra origem é rejeitada', async () => { const r = await handlePersonalDates(new Request('https://example.com/api/public/personal-dates', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'abriu' }) })); expect(r.status).toBe(403); expect(mocks.inserts.length).toBe(0); });
  it('retorna só primeiro nome, sem telefone ou ids', async () => { const body = await (await handlePersonalDates(request({}))).json(); expect(body.firstName).toBe('André'); expect(body.opportunity_id).toBeUndefined(); expect(body.phone).toBeUndefined(); expect(body.requested).toHaveLength(2); });
  it('escolha registra casa escolhida sem atualizar oportunidade', async () => { const body = await (await handlePersonalDates(request({ action: 'escolheu_data', house: 'vila', date: '2027-01-23', slot: 'jantar' }))).json(); expect(body.url).toContain('5511937123020'); expect(mocks.inserts.map(i => i.action)).toEqual(['escolheu_data','mudou_casa']); expect(mocks.inserts[0]?.house).toBe('vila'); });
  it('sem agenda não permite escolha', async () => { mocks.status = 'unavailable'; const body = await (await handlePersonalDates(request({ action: 'escolheu_data', house: 'bosque', date: '2027-01-23', slot: 'almoco' }))).json(); expect(body.state).toBe('unavailable'); expect(body.url).toBeUndefined(); expect(mocks.inserts).toHaveLength(0); });
  it('fila é rejeitada para turno disponível', async () => { const r = await handlePersonalDates(request({ action: 'entrou_fila', house: 'bosque', date: '2027-01-23', slot: 'almoco' })); expect(r.status).toBe(409); expect(mocks.inserts).toHaveLength(0); });
});