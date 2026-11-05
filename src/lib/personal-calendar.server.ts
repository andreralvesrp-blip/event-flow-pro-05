import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { horizon, type CalendarEvent, type CalendarSet } from './personal-dates';

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function tokenHash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function newPersonalToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';
export function calendarConnectionReady() { return Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY); }
export async function loadCalendars(db: SupabaseClient<Database>, tenant: string, today: string): Promise<CalendarSet> {
  const lovableKey = process.env.LOVABLE_API_KEY, calendarKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !calendarKey) throw new Error('Conecte a conta Google Calendar');
  const { data: config, error } = await db.from('date_calendar_settings').select('*').eq('tenant_id', tenant).maybeSingle();
  if (error || !config) throw new Error('Agendas ainda não configuradas');
  const keys = ['bosque_closed', 'bosque_interest', 'vila_closed', 'vila_interest'] as const;
  if (keys.some(k => !config[k])) throw new Error('Configure as quatro agendas');
  const entries = await Promise.all(keys.map(async key => {
    const id = config[key];
    const cacheKey = `${id}|${today}`;
    const { data: cached } = await db.from('date_calendar_cache').select('fetched_at,events').eq('tenant_id', tenant).eq('calendar_id', cacheKey).maybeSingle();
    const age = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
    if (cached && age >= 0 && age < 60000) return [key, cached.events as unknown as CalendarEvent[]] as const;
    const events: CalendarEvent[] = [];
    let nextPage: string | undefined;
    const fetchedAt = new Date().toISOString();
    do {
      const q = new URLSearchParams({ timeMin: `${today}T00:00:00-03:00`, timeMax: `${horizon(today)}T23:59:59-03:00`, singleEvents: 'true', showDeleted: 'false', maxResults: '2500', timeZone: 'America/Sao_Paulo' });
      if (nextPage) q.set('pageToken', nextPage);
      const response = await fetch(`${GATEWAY_URL}/calendars/${encodeURIComponent(id)}/events?${q}`, { method: 'GET', headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': calendarKey } });
      if (!response.ok) { console.error('Calendar read failed', response.status, (await response.text()).slice(0, 300)); throw new Error('Não foi possível consultar as agendas'); }
      const data = await response.json() as { items?: CalendarEvent[]; nextPageToken?: string };
      // Não persistir nomes, convidados nem descrições dos eventos.
      events.push(...(data.items ?? []).filter(e => e.status !== 'cancelled').map(e => ({ start: e.start, end: e.end, status: e.status })));
      nextPage = data.nextPageToken;
    } while (nextPage);
    const { error: cacheError } = await db.from('date_calendar_cache').upsert({ tenant_id: tenant, calendar_id: cacheKey, fetched_at: fetchedAt, events: events as unknown as Database['public']['Tables']['date_calendar_cache']['Insert']['events'] });
    if (cacheError) throw new Error('Não foi possível atualizar as agendas');
    return [key, events] as const;
  }));
  const get = (key: typeof keys[number]) => entries.find(e => e[0] === key)?.[1] ?? [];
  return { bosque: { closed: get('bosque_closed'), interest: get('bosque_interest') }, vila: { closed: get('vila_closed'), interest: get('vila_interest') } };
}