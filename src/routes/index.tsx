import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: 'Kids Point — Gestão de festas' }, { name: 'description', content: 'Gestão das festas e oportunidades Kids Point.' }, { property: 'og:title', content: 'Kids Point — Gestão de festas' }, { property: 'og:description', content: 'Gestão das festas e oportunidades Kids Point.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
