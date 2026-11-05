import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { horizon, type CalendarEvent, type CalendarSet } from './personal-dates';

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function tokenHash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function newPersonalToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
async function googleAccessToken(json: string) {
  const account = JSON.parse(json) as { client_email?: string; private_key?: string; token_uri?: string };
  if (!account.client_email || !account.private_key) throw new Error('Conta de serviço incompleta');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(encoder.encode(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/calendar.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }) });
  if (!response.ok) { console.error('Calendar authentication failed', response.status); throw new Error('Não foi possível consultar as agendas'); }
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google não autorizou a leitura');
  return data.access_token;
}
export async function loadCalendars(db: SupabaseClient<Database>, tenant: string, json: string | undefined, today: string): Promise<CalendarSet> {
  if (!json) throw new Error('Conta de serviço ainda não configurada');
  const { data: config, error } = await db.from('date_calendar_settings').select('*').eq('tenant_id', tenant).maybeSingle();
  if (error || !config) throw new Error('Agendas ainda não configuradas');
  const keys = ['bosque_closed', 'bosque_interest', 'vila_closed', 'vila_interest'] as const;
  if (keys.some(k => !config[k])) throw new Error('Configure as quatro agendas');
  const accessToken = await googleAccessToken(json);
  const entries = await Promise.all(keys.map(async key => {
    const id = config[key];
    const { data: cached } = await db.from('date_calendar_cache').select('fetched_at,events').eq('tenant_id', tenant).eq('calendar_id', id).maybeSingle();
    const age = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
    if (cached && age >= 0 && age < 60000) return [key, cached.events as unknown as CalendarEvent[]] as const;
    const events: CalendarEvent[] = [];
    let nextPage: string | undefined;
    const fetchedAt = new Date().toISOString();
    do {
      const q = new URLSearchParams({ timeMin: `${today}T00:00:00-03:00`, timeMax: `${horizon(today)}T23:59:59-03:00`, singleEvents: 'true', showDeleted: 'false', maxResults: '2500', timeZone: 'America/Sao_Paulo' });
      if (nextPage) q.set('pageToken', nextPage);
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) { console.error('Calendar read failed', response.status); throw new Error('Não foi possível consultar as agendas'); }
      const data = await response.json() as { items?: CalendarEvent[]; nextPageToken?: string };
      // Não persistir nomes, convidados nem descrições dos eventos.
      events.push(...(data.items ?? []).filter(e => e.status !== 'cancelled').map(e => ({ start: e.start, end: e.end, status: e.status })));
      nextPage = data.nextPageToken;
    } while (nextPage);
    const { error: cacheError } = await db.from('date_calendar_cache').upsert({ tenant_id: tenant, calendar_id: id, fetched_at: fetchedAt, events: events as unknown as Database['public']['Tables']['date_calendar_cache']['Insert']['events'] });
    if (cacheError) throw new Error('Não foi possível atualizar as agendas');
    return [key, events] as const;
  }));
  const get = (key: typeof keys[number]) => entries.find(e => e[0] === key)?.[1] ?? [];
  return { bosque: { closed: get('bosque_closed'), interest: get('bosque_interest') }, vila: { closed: get('vila_closed'), interest: get('vila_interest') } };
}