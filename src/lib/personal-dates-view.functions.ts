import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Closure, DayTurns, House, Slot } from './personal-dates';
export type Asked = { date: string; slot: Slot; queue: boolean };
export type PersonalDateBase = { firstName: string; origin: House; requestedDate: string | null; today: string; horizon: string; fallbackUrl: string; asked: Asked[]; error?: string };
export type PersonalDateFull = PersonalDateBase & { state: 'ready' | 'unopened' | 'closed' | 'unavailable' | 'nodate'; requested?: DayTurns; options: DayTurns[]; closure?: Closure };
export type MonthDay = DayTurns | { date: string; off: true };
const call = async (token: string, extra = '') => {
  const { handlePersonalDates } = await import('./personal-dates-public.server');
  const r = await handlePersonalDates(new Request(`https://personal-dates.internal/api/public/personal-dates?token=${encodeURIComponent(token)}${extra}`));
  return r.json();
};
const tk = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const getPersonalDateBase = createServerFn({ method: 'GET' }).inputValidator(d => tk.parse(d)).handler(async ({ data }) => (await call(data.token, '&part=base')) as PersonalDateBase);
export const getPersonalDateFull = createServerFn({ method: 'GET' }).inputValidator(d => tk.parse(d)).handler(async ({ data }) => (await call(data.token)) as PersonalDateFull);
export const getPersonalDateMonth = createServerFn({ method: 'GET' }).inputValidator(d => tk.extend({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d)).handler(async ({ data }) => (await call(data.token, `&month=${data.month}`)) as PersonalDateBase & { days: MonthDay[] });
