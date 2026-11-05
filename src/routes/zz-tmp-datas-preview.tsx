import { createFileRoute } from '@tanstack/react-router';
import { ClientOnly } from '@tanstack/react-router';
import { DatesJourney } from './datas.$token';
import pageCss from '@/styles/datas-kids-point.css?url';
const o = (house: any, date: string, slot: any, status: any, price: number, cheaper = false) => ({ house, date, slot, status, price, cheaper });
const req = '2027-05-15';
const near = [o('bosque','2027-05-08','almoco','disponivel',11030),o('bosque','2027-05-08','jantar','disponivel',11030),o('bosque','2027-05-09','almoco','disponivel',11030),o('bosque','2027-05-09','jantar','disponivel',7830,true),o('bosque','2027-05-22','jantar','disponivel',11030),o('bosque','2027-05-14','almoco','disponivel',7830,true),o('vila','2027-05-08','jantar','disponivel',11030),o('vila','2027-05-16','jantar','disponivel',7830,true)];
const base = { firstName: 'Mariana', origin: 'bosque', requestedDate: req, noPrice: false, state: 'ready' };
const cases: Record<string, any> = {
  livre: { ...base, requested: [o('bosque',req,'almoco','disponivel',11030),o('bosque',req,'jantar','disponivel',11030)], options: near },
  parcial: { ...base, requested: [o('bosque',req,'almoco','ocupado',11030),o('bosque',req,'jantar','disponivel',11030)], options: near },
  fila: { ...base, requested: [o('bosque',req,'almoco','interesse',11030),o('bosque',req,'jantar','disponivel',11030)], options: near },
  outra: { ...base, requested: [o('bosque',req,'almoco','ocupado',11030),o('bosque',req,'jantar','ocupado',11030)], options: [o('vila',req,'almoco','disponivel',11030),o('vila',req,'jantar','disponivel',11030),...near] },
  cheia: { ...base, requested: [o('bosque',req,'almoco','ocupado',11030),o('bosque',req,'jantar','ocupado',11030)], options: near },
  fechado: { ...base, state: 'unopened', requested: [], options: [] },
  kidsday: { ...base, noPrice: true, requested: [o('bosque',req,'almoco','disponivel',11030),o('bosque',req,'jantar','disponivel',11030)], options: near },
};
export const Route = createFileRoute('/zz-tmp-datas-preview')({
  head: () => ({ links: [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:wght@400;600;700;800&display=swap' }, { rel: 'stylesheet', href: pageCss }] }),
  component: () => { const c = typeof window !== 'undefined' ? new URLSearchParams(location.search).get('c') ?? 'livre' : 'livre'; return <ClientOnly><DatesJourney token={'x'.repeat(43)} initial={cases[c]} /></ClientOnly>; },
});
