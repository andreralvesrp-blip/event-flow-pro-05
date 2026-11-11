import { z } from 'zod';
import { closureFor, type Closure, inWindow, isAllowedForm, saoPauloToday, horizon, whatsappUrl, otherOptions, requestedTurns, monthTurns, type House } from './personal-dates';
import { loadCalendars, tokenHash } from './personal-calendar.server';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const inputSchema = z.object({
  token: tokenSchema,
  part: z.enum(['base', 'full']).default('full'),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  action: z.enum(['abriu', 'escolheu_data', 'entrou_fila', 'abriu_calendario', 'falou_equipe']).optional(),
  detail: z.enum(['email', 'whatsapp', 'data_pedida', 'alternativa', 'calendario']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slot: z.enum(['almoco', 'jantar']).optional(),
});
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
  const { data: op } = await db.from('opportunities').select('id,tenant_id,unit_id,form_slug,desired_date,desired_slot,contact_name,client:clients(full_name)').eq('id', link.opportunity_id).eq('tenant_id', link.tenant_id).maybeSingle();
  if (!op || !isAllowedForm(op.form_slug)) return respond({ error: 'Link indisponível' }, 404);
  const { data: unit } = await db.from('units').select('slug').eq('id', op.unit_id ?? '').eq('tenant_id', link.tenant_id).maybeSingle();
  const origin: House | null = unit?.slug === 'bosque-da-saude' ? 'bosque' : unit?.slug === 'vila-mariana' ? 'vila' : null;
  if (!origin) return respond({ error: 'Vamos confirmar com a equipe.' }, 503);
  const client = Array.isArray(op.client) ? op.client[0] : op.client;
  const firstName = ((op as any)?.contact_name || client?.full_name)?.trim().split(/\s+/)[0] || 'Olá';
  const today = saoPauloToday();
  const requested = op.desired_date && op.desired_date > today ? op.desired_date : null;
  const record = async (action: string, date?: string, slot?: string, detail?: string) => {
    const { error } = await db.from('date_interactions').insert({ tenant_id: link.tenant_id, opportunity_id: op.id, link_id: link.id, action, house: origin, party_date: date ?? null, slot: slot ?? null, detail: detail ?? null });
    if (error) throw new Error('Falha ao registrar interação');
  };
  try {
    if (input.action) {
      if (input.action === 'abriu') {
        const since = new Date(Date.now() - 10_000).toISOString();
        const { data: recent } = await db.from('date_interactions').select('id').eq('link_id', link.id).eq('action', 'abriu').gte('created_at', since).limit(1);
        if (!recent?.length) await record('abriu', undefined, undefined, input.detail === 'email' ? 'email' : 'whatsapp');
      } else if (input.action === 'abriu_calendario' || input.action === 'falou_equipe') {
        await record(input.action);
      } else {
        // Sem reler agendas: só confere a janela de datas e grava (a navegação ao WhatsApp já aconteceu).
        if (!input.date || !input.slot || !inWindow(input.date, today)) return respond({ error: 'Opção indisponível' }, 409);
        if (input.action === 'entrou_fila') {
          const { data: dup } = await db.from('date_interactions').select('id').eq('opportunity_id', op.id).eq('action', 'entrou_fila').eq('house', origin).eq('party_date', input.date).eq('slot', input.slot).limit(1);
          if (!dup?.length) await record('entrou_fila', input.date, input.slot);
        } else await record('escolheu_data', input.date, input.slot, input.detail ?? 'alternativa');
      }
      return respond({ ok: true });
    }
    const { data: asked } = await db.from('date_interactions').select('action,party_date,slot,created_at').eq('opportunity_id', op.id).in('action', ['escolheu_data', 'entrou_fila']).order('created_at', { ascending: false }).limit(50);
    const base = { firstName, origin, requestedDate: requested, today, horizon: horizon(today), fallbackUrl: whatsappUrl(firstName, origin), asked: (asked ?? []).filter(a => a.party_date && a.slot).map(a => ({ date: a.party_date as string, slot: a.slot as 'almoco' | 'jantar', queue: a.action === 'entrou_fila' })) };
    if (input.part === 'base') return respond(base);
    const [calendars, { data: holidayRows, error: he }, { data: closureRows, error: ce }] = await Promise.all([
      loadCalendars(db, link.tenant_id, today),
      db.from('date_holidays').select('holiday_date').eq('tenant_id', link.tenant_id),
      db.from('date_closures').select('start_date,end_date,name').eq('tenant_id', link.tenant_id),
    ]);
    if (he || ce) throw new Error('Falha ao ler datas');
    const holidays = (holidayRows ?? []).map(h => h.holiday_date);
    const closures: Closure[] = closureRows ?? [];
    if (input.month) return respond({ ...base, month: input.month, days: monthTurns(input.month, origin, calendars, holidays, today, closures) });
    if (!requested) return respond({ ...base, state: 'nodate', options: [] });
    const anchor = requested > horizon(today) ? horizon(today) : requested;
    const options = otherOptions(anchor, origin, calendars, holidays, today, closures);
    if (requested > horizon(today)) return respond({ ...base, state: 'unopened', options });
    const closure = closureFor(requested, closures);
    if (closure) return respond({ ...base, state: 'closed', closure, options });
    return respond({ ...base, state: 'ready', requested: requestedTurns(requested, origin, calendars, holidays), options });
  } catch {
    return respond({ firstName, origin, requestedDate: requested, today, horizon: horizon(today), fallbackUrl: whatsappUrl(firstName, origin), asked: [], state: 'unavailable', options: [] });
  }
}
