import { createFileRoute, Link } from "@tanstack/react-router";
import { Webhook, Building2, Plug } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/configuracoes")({
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const cards = [
    {
      to: "/webhooks",
      title: "Webhooks",
      desc: "Eventos recebidos da Clicksign, payload e reprocessamento.",
      icon: Webhook,
      enabled: true,
    },
    {
      to: "#",
      title: "Dados da empresa",
      desc: "Nome do buffet, CNPJ e informações da contratada.",
      icon: Building2,
      enabled: false,
    },
    {
      to: "#",
      title: "Integrações",
      desc: "Clicksign, WhatsApp e outras integrações.",
      icon: Plug,
      enabled: false,
    },
  ];

  return (
    <AppLayout title="Configurações">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl">
        {cards.map((c) => {
          const Icon = c.icon;
          const inner = (
            <div
              className={`bg-white border border-slate-200 rounded-lg p-5 h-full transition-shadow ${
                c.enabled ? "hover:shadow-md cursor-pointer" : "opacity-60"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
              </div>
              <p className="text-xs text-slate-600">{c.desc}</p>
              {!c.enabled && (
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-3">Em breve</div>
              )}
            </div>
          );
          return c.enabled ? (
            <Link key={c.title} to={c.to}>{inner}</Link>
          ) : (
            <div key={c.title}>{inner}</div>
          );
        })}
      </div>
    </AppLayout>
  );
}
