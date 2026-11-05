import { z } from 'zod';
import { availability, buildOptions, inWindow, isAllowedForm, priceFor, saoPauloToday, horizon, whatsappUrl, type Availability, type House, type Slot, type Turno } from './personal-dates';
import { loadCalendars, tokenHash } from './personal-calendar.server';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const inputSchema = z.object({ token: tokenSchema, mode: z.enum(['all','origin','other']).default('all'), action: z.enum(['abriu','viu_opcao','escolheu_data','entrou_fila','mudou_casa','falou_equipe']).optional(), house: z.enum(['bosque','vila']).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), slot: z.enum(['almoco','jantar','ambos']).optional() });
export async function handlePersonalDates(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' };
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  const parsed = inputSchema.safeParse(request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams) : await request.json().catch(() => null));
  if (!parsed.success) return respond({ error: 'Link indisponível' }, 400);
  const input = parsed.data;
  if (request.method === 'GET' && input.action) return respond({ error: 'Não autorizado' }, 405);
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return respond({ error: 'Não autorizado' }, 403);
  }
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { data: link, error: linkError } = await db.from('date_personal_links').select('id,opportunity_id,tenant_id').eq('token_hash', await tokenHash(input.token)).is('revoked_at', null).maybeSingle();
  if (linkError) return respond({ error: 'Vamos confirmar com a equipe.' }, 503);
  if (!link) return respond({ error: 'Link indisponível' }, 404);
  const { data: op } = await db.from('opportunities').select('id,tenant_id,unit_id,form_slug,desired_date,desired_slot,client:clients(full_name)').eq('id', link.opportunity_id).eq('tenant_id', link.tenant_id).maybeSingle();
  if (!op || !isAllowedForm(op.form_slug)) return respond({ error: 'Link indisponível' }, 404);
  const { data: unit } = await db.from('units').select('slug').eq('id', op.unit_id ?? '').eq('tenant_id', link.tenant_id).maybeSingle();
  const origin: House | null = unit?.slug === 'bosque-da-saude' ? 'bosque' : unit?.slug === 'vila-mariana' ? 'vila' : null;
  if (!origin) return respond({ error: 'Vamos confirmar com a equipe.' }, 503);
  const client = Array.isArray(op.client) ? op.client[0] : op.client;
  const firstName = client?.full_name?.trim().split(/\s+/)[0] || 'Olá';
  const today = saoPauloToday();
  const requested = op.desired_date;
  const base = { firstName, origin, requestedDate: requested && requested > today ? requested : null, noPrice: String(op.form_slug) === 'bs-kids-day', today, horizon: horizon(today) };
  const record = async (action: NonNullable<typeof input.action>, house?: House, date?: string, slot?: Turno) => {
    const { error } = await db.from('date_interactions').insert({ tenant_id: link.tenant_id, opportunity_id: op.id, link_id: link.id, action, house: house ?? null, party_date: date ?? null, slot: slot ?? null });
    if (error) throw new Error('Falha ao registrar interação');
  };
  try {
    if (input.action === 'abriu') await record('abriu');
    if (input.action === 'falou_equipe') {
      const house = input.house ?? origin;
      // Não confiar na data recebida para apresentar datas fora da janela.
      const date = input.date && inWindow(input.date, today) ? input.date : undefined;
      await record('falou_equipe', house, date, input.slot);
      return respond({ ok: true, url: whatsappUrl(firstName, house, date, input.slot) });
    }
    if (!requested || requested > horizon(today)) return respond({ ...base, state: 'unopened', requested: [], options: [] });
    const calendars = await loadCalendars(db, link.tenant_id, today);
    const { data: holidayRows, error: holidayError } = await db.from('date_holidays').select('holiday_date').eq('tenant_id', link.tenant_id);
    if (holidayError) throw new Error('Falha ao ler feriados');
    const holidays = (holidayRows ?? []).map(h => h.holiday_date);
    const allOptions = buildOptions(requested, origin, calendars, holidays, today, input.mode, op.desired_slot as Slot | null);
    const requestedOptions = inWindow(requested, today) ? (['almoco','jantar'] as const).map(slot => ({ house: origin, date: requested, slot, status: availability(requested, calendars[origin].closed, calendars[origin].interest)[slot], price: priceFor(requested, slot, holidays), cheaper: false })) : [];
    if (input.action === 'mudou_casa') await record('mudou_casa', input.mode === 'other' ? origin === 'bosque' ? 'vila' : 'bosque' : origin);
    if (input.action && ['viu_opcao','escolheu_data','entrou_fila'].includes(input.action)) {
      if (!input.house || !input.date || !input.slot || !inWindow(input.date, today)) return respond({ error: 'Opção indisponível' }, 409);
      // "almoço ou jantar" só existe como escolha de data; fila e visualização são por turno.
      if (input.slot === 'ambos' && input.action !== 'escolheu_data') return respond({ error: 'Opção indisponível' }, 409);
      const turns = availability(input.date, calendars[input.house].closed, calendars[input.house].interest);
      // "ambos" = almoço ou jantar: só vale quando os dois turnos estão livres na mesma data e casa.
      const slots: Slot[] = input.slot === 'ambos' ? ['almoco', 'jantar'] : [input.slot];
      const status: Availability = slots.every(s => turns[s] === 'disponivel') ? 'disponivel' : slots.some(s => turns[s] === 'interesse') ? 'interesse' : 'ocupado';
      const pool = [...buildOptions(requested, origin, calendars, holidays, today, 'all', op.desired_slot as Slot | null), ...requestedOptions];
      const legal = slots.every(s => pool.some(o => o.house === input.house && o.date === input.date && o.slot === s));
       if (!legal || (input.action === 'escolheu_data' && status !== 'disponivel') || (input.action === 'entrou_fila' && status !== 'interesse')) return respond({ error: 'Esta opção mudou. Vamos confirmar com a equipe.' }, 409);
      await record(input.action, input.house, input.date, input.slot);
      if (input.house !== origin && input.action === 'escolheu_data') await record('mudou_casa', input.house, input.date, input.slot);
      if (input.action !== 'viu_opcao') return respond({ ok: true, url: whatsappUrl(firstName, input.house, input.date, input.slot, input.action === 'entrou_fila') });
    }
    return respond({ ...base, state: 'ready', requested: requestedOptions, options: allOptions });
  } catch {
    return respond({ ...base, state: 'unavailable', requested: [], options: [], message: 'Vamos confirmar com a equipe.' });
  }
}