import { createFileRoute } from '@tanstack/react-router';
import { DatesJourney } from './datas.$token';
import type { PersonalDateView } from '@/lib/personal-dates-view.functions';

const D = '2027-01-23';
const initial: PersonalDateView = {
  firstName: 'André',
  origin: 'bosque',
  requestedDate: D,
  noPrice: false,
  state: 'ready',
  requested: [
    { house: 'bosque', date: D, slot: 'almoco', status: 'ocupado', price: 11030, cheaper: false },
    { house: 'bosque', date: D, slot: 'jantar', status: 'ocupado', price: 11030, cheaper: false },
  ],
  options: [
    { house: 'vila', date: D, slot: 'almoco', status: 'disponivel', price: 11030, cheaper: false },
    { house: 'vila', date: D, slot: 'jantar', status: 'disponivel', price: 11030, cheaper: false },
    { house: 'bosque', date: '2027-01-30', slot: 'almoco', status: 'disponivel', price: 11030, cheaper: false },
    { house: 'bosque', date: '2027-01-30', slot: 'jantar', status: 'disponivel', price: 11030, cheaper: false },
    { house: 'bosque', date: '2027-02-06', slot: 'almoco', status: 'disponivel', price: 11030, cheaper: false },
    { house: 'bosque', date: '2027-02-06', slot: 'jantar', status: 'disponivel', price: 11030, cheaper: false },
    { house: 'vila', date: '2027-01-30', slot: 'almoco', status: 'disponivel', price: 7830, cheaper: true },
    { house: 'vila', date: '2027-01-30', slot: 'jantar', status: 'disponivel', price: 7830, cheaper: true },
  ],
};

export const Route = createFileRoute('/zz-tmp-datas-preview')({
  component: () => <DatesJourney token={'a'.repeat(43)} initial={initial} />,
});
