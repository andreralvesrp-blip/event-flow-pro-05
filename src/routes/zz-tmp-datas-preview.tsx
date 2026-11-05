import { createFileRoute } from '@tanstack/react-router';
import { DatesJourney } from './datas.$token';
import type { PersonalDateView } from '@/lib/personal-dates-view.functions';
import pageCss from '@/styles/datas-kids-point.css?url';

const D = '2027-01-23';
const options: PersonalDateView['options'] = [
  { house: 'vila', date: D, slot: 'almoco', status: 'disponivel', price: 11030, cheaper: false },
  { house: 'vila', date: D, slot: 'jantar', status: 'disponivel', price: 11030, cheaper: false },
  { house: 'bosque', date: '2027-01-30', slot: 'almoco', status: 'disponivel', price: 11030, cheaper: false },
  { house: 'bosque', date: '2027-01-30', slot: 'jantar', status: 'disponivel', price: 11030, cheaper: false },
  { house: 'bosque', date: '2027-02-06', slot: 'almoco', status: 'disponivel', price: 11030, cheaper: false },
  { house: 'bosque', date: '2027-02-06', slot: 'jantar', status: 'disponivel', price: 11030, cheaper: false },
  { house: 'vila', date: '2027-01-30', slot: 'almoco', status: 'disponivel', price: 7830, cheaper: true },
  { house: 'vila', date: '2027-01-30', slot: 'jantar', status: 'disponivel', price: 7830, cheaper: true },
];
const initial = (screen: string): PersonalDateView => ({
  firstName: 'André',
  origin: 'bosque',
  requestedDate: D,
  noPrice: false,
  state: 'ready',
  requested: screen === 'lista' ? [] : [
    { house: 'bosque', date: D, slot: 'almoco', status: 'ocupado', price: 11030, cheaper: false },
    { house: 'bosque', date: D, slot: 'jantar', status: 'ocupado', price: 11030, cheaper: false },
  ],
  options,
});

export const Route = createFileRoute('/zz-tmp-datas-preview')({
  validateSearch: (s: Record<string, unknown>) => ({ screen: typeof s.screen === 'string' ? s.screen : 'outra' }),
  head: () => ({
    meta: [{ title: 'Temp' }],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:wght@400;600;700;800&display=swap' },
      { rel: 'stylesheet', href: pageCss },
    ],
  }),
  component: () => {
    const { screen } = Route.useSearch();
    return <DatesJourney token={'a'.repeat(43)} initial={initial(screen)} />;
  },
});
