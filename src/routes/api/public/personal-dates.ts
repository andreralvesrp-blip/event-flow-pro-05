import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/personal-dates')({
  server: { handlers: {
    GET: async ({ request }) => { const { handlePersonalDates } = await import('@/lib/personal-dates-public.server'); return handlePersonalDates(request); },
    POST: async ({ request }) => { const { handlePersonalDates } = await import('@/lib/personal-dates-public.server'); return handlePersonalDates(request); },
  } },
});