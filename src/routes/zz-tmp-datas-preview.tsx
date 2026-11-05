import { createFileRoute } from '@tanstack/react-router';
import { DatesJourney } from './datas.$token';
import { availability, buildOptions, closureFor, priceFor, type CalendarSet } from '@/lib/personal-dates';
import pageCss from '@/styles/datas-kids-point.css?url';
const ev = (d: string, a: string, b: string) => ({ start: { dateTime: `${d}T${a}:00-03:00` }, end: { dateTime: `${d}T${b}:00-03:00` } });
export const Route = createFileRoute('/zz-tmp-datas-preview')({
  validateSearch: (s: Record<string, unknown>) => ({ d: String(s.d ?? '2026-12-26') }),
  head: () => ({ links: [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:wght@400;600;700;800&display=swap' }, { rel: 'stylesheet', href: pageCss }] }),
  component: () => {
    const { d } = Route.useSearch();
    const closures = [{ start_date: '2026-12-21', end_date: '2027-01-05', name: 'Recesso de fim de ano' }];
    const cal: CalendarSet = { bosque: { closed: [ev('2026-12-19', '19:00', '23:00'), ev('2027-01-09', '12:00', '16:00')], interest: [ev('2026-12-18', '12:00', '16:00'), ev('2026-12-26', '12:00', '16:00')] }, vila: { closed: [], interest: [] } };
    const closure = closureFor(d, closures);
    const requested = closure ? [] : (['almoco', 'jantar'] as const).map(slot => ({ house: 'bosque' as const, date: d, slot, status: availability(d, cal.bosque.closed, cal.bosque.interest)[slot], price: priceFor(d, slot, []), cheaper: false }));
    const view = { firstName: 'André', origin: 'bosque' as const, requestedDate: d, noPrice: false, state: 'ready' as const, closure, requested, options: buildOptions(d, 'bosque', cal, [], '2026-11-05', 'all', null, closures) };
    return <DatesJourney key={d} token={'x'.repeat(43)} initial={view} />;
  },
});
