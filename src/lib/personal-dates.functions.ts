import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { isAllowedForm } from './personal-dates';

const settingsSchema = z.object({ bosque_closed: z.string().trim().max(500), bosque_interest: z.string().trim().max(500), vila_closed: z.string().trim().max(500), vila_interest: z.string().trim().max(500) });
const holidaySchema = z.object({ id: z.string().uuid().optional(), holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d), name: z.string().trim().min(1).max(120) });
export const getDateSettings = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: me } = await context.supabase.from('users').select('tenant_id,tenant_role,active').eq('id', context.userId).maybeSingle();
  if (!me?.active || me.tenant_role !== 'owner') throw new Error('Acesso restrito ao responsável da empresa');
  const [settings, holidays] = await Promise.all([context.supabase.from('date_calendar_settings').select('*').eq('tenant_id', me.tenant_id).maybeSingle(), context.supabase.from('date_holidays').select('*').eq('tenant_id', me.tenant_id).order('holiday_date')]);
  if (settings.error || holidays.error) throw new Error('Não foi possível carregar o calendário');
  return { settings: settings.data, holidays: holidays.data ?? [], serviceAccountReady: Boolean(process.env['GOOGLE_SERVICE_ACCOUNT_JSON']) };
});
export const saveDateSettings = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => settingsSchema.parse(d)).handler(async ({ data, context }) => {
  const { data: me } = await context.supabase.from('users').select('tenant_id,tenant_role,active').eq('id', context.userId).maybeSingle();
  if (!me?.active || me.tenant_role !== 'owner') throw new Error('Acesso restrito');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('date_calendar_settings').upsert({ ...data, tenant_id: me.tenant_id, updated_at: new Date().toISOString() });
  if (error) throw new Error('Não foi possível salvar as agendas');
  return { ok: true };
});
export const saveDateHoliday = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => holidaySchema.parse(d)).handler(async ({ data, context }) => {
  const { data: me } = await context.supabase.from('users').select('tenant_id,tenant_role,active').eq('id', context.userId).maybeSingle();
  if (!me?.active || me.tenant_role !== 'owner') throw new Error('Acesso restrito');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const payload = { holiday_date: data.holiday_date, name: data.name };
  const result = data.id ? await supabaseAdmin.from('date_holidays').update(payload).eq('id', data.id).eq('tenant_id', me.tenant_id) : await supabaseAdmin.from('date_holidays').insert({ ...payload, tenant_id: me.tenant_id });
  if (result.error) throw new Error('Não foi possível salvar o feriado; confira se a data já existe');
  return { ok: true };
});
export const deleteDateHoliday = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => {
  const { data: me } = await context.supabase.from('users').select('tenant_id,tenant_role,active').eq('id', context.userId).maybeSingle();
  if (!me?.active || me.tenant_role !== 'owner') throw new Error('Acesso restrito');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('date_holidays').delete().eq('id', data.id).eq('tenant_id', me.tenant_id);
  if (error) throw new Error('Não foi possível excluir o feriado');
  return { ok: true };
});
export const createPersonalDateLink = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => z.object({ opportunity_id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => {
  const { data: me } = await context.supabase.from('users').select('tenant_id,active').eq('id', context.userId).maybeSingle();
  if (!me?.active) throw new Error('Acesso restrito');
  const { data: op } = await context.supabase.from('opportunities').select('id,tenant_id,form_slug').eq('id', data.opportunity_id).maybeSingle();
  if (!op || op.tenant_id !== me.tenant_id || !isAllowedForm(op.form_slug)) throw new Error('Link permitido somente para bs-orcamento-teste');
  const { newPersonalToken, tokenHash } = await import('./personal-calendar.server');
  const token = newPersonalToken();
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('date_personal_links').insert({ tenant_id: op.tenant_id, opportunity_id: op.id, token_hash: await tokenHash(token) });
  if (error) throw new Error('Não foi possível criar o link');
  return { path: `/datas/${token}` };
});
export const checkDateCalendars = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: me } = await context.supabase.from('users').select('tenant_id,tenant_role,active').eq('id', context.userId).maybeSingle();
  if (!me?.active || me.tenant_role !== 'owner') throw new Error('Acesso restrito');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { loadCalendars } = await import('./personal-calendar.server');
  const { saoPauloToday } = await import('./personal-dates');
  await loadCalendars(supabaseAdmin, me.tenant_id, process.env['GOOGLE_SERVICE_ACCOUNT_JSON'], saoPauloToday());
  return { ok: true };
});