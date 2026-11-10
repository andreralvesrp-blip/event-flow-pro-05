import { createFileRoute } from '@tanstack/react-router';
import { LinkUnavailable } from '@/components/LinkUnavailable';

export const Route = createFileRoute('/datas/')({
  head: () => ({ meta: [{ title: 'Link indisponível — Kids Point' }, { name: 'description', content: 'Este link de datas da Kids Point não está mais disponível.' }, { property: 'og:title', content: 'Link indisponível — Kids Point' }, { property: 'og:description', content: 'Este link de datas da Kids Point não está mais disponível.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: LinkUnavailable,
});
