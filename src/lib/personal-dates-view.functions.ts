import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Closure, House, Option } from './personal-dates';
export type PersonalDateView = { firstName: string; origin: House; requestedDate: string | null; noPrice: boolean; state: 'ready' | 'unopened' | 'unavailable'; requested: Option[]; options: Option[]; closure?: Closure | null; error?: string };
export const getPersonalDateView = createServerFn({ method: 'GET' }).inputValidator(d => z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(d)).handler(async ({ data }): Promise<PersonalDateView> => {
  const { handlePersonalDates } = await import('./personal-dates-public.server');
  const response = await handlePersonalDates(new Request(`https://personal-dates.internal/api/public/personal-dates?token=${encodeURIComponent(data.token)}`));
  return await response.json() as PersonalDateView;
});