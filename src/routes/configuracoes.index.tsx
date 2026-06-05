import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Webhook, Building2, Plug, FileSpreadsheet, FileText, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/configuracoes/")({
  component: ConfiguracoesIndex,
});

function ConfiguracoesIndex() {
  const { profile } = useAuth();
  const isOwner = profile?.tenant_role === "owner";
  const [activeForms, setActiveForms] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .then(({ count }) => setActiveForms(count ?? 0));
  }, []);

  const cards = [
    {
      to: "/formularios",
      title: "Formulários conversacionais",
      desc: "Crie formulários para capturar leads em landings e anúncios.",
      icon: FileText,
      enabled: true,
      badge: activeForms !== null ? `${activeForms} ativo${activeForms === 1 ? "" : "s"}` : null,
      group: "Captura de leads",
    },
    { to: "/webhooks", title: "Webhooks", desc: "Eventos recebidos da Clicksign, payload e reprocessamento.", icon: Webhook, enabled: true, group: "Administração" },
    { to: "/configuracoes/importacao-historica", title: "Importação histórica", desc: "Carregue a planilha canônica de festas antigas e confirme o commit em staging.", icon: FileSpreadsheet, enabled: true, group: "Administração" },
    ...(isOwner ? [
      { to: "/configuracoes/unidades", title: "Unidades", desc: "Gerencie as unidades do buffet.", icon: Building2, enabled: true, group: "Administração" },
      { to: "/configuracoes/equipe", title: "Equipe", desc: "Defina quais unidades cada pessoa acessa.", icon: Users, enabled: true, group: "Administração" },
    ] : []),
    { to: "#", title: "Dados da empresa", desc: "Nome do buffet, CNPJ e informações da contratada.", icon: Building2, enabled: false, group: "Administração" },
    { to: "/configuracoes/integracoes", title: "Integrações", desc: "Conecte o Google Analytics e outras integrações.", icon: Plug, enabled: true, group: "Administração" },
  ];

  const captura = cards.filter((c) => c.group === "Captura de leads");
  const outros = cards.filter((c) => c.group !== "Captura de leads");

  function CardItem(c: typeof cards[number]) {
    const Icon = c.icon;
    const inner = (
      <div className={`bg-white border border-slate-200 rounded-lg p-5 h-full transition-shadow ${c.enabled ? "hover:shadow-md cursor-pointer" : "opacity-60"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
          </div>
          {(c as any).badge && (
            <span className="text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
              {(c as any).badge}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-600">{c.desc}</p>
        {!c.enabled && <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-3">Em breve</div>}
      </div>
    );
    return c.enabled ? <Link key={c.title} to={c.to}>{inner}</Link> : <div key={c.title}>{inner}</div>;
  }

  return (
    <AppLayout title="Configurações">
      <div className="max-w-4xl space-y-8">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">Captura de leads</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {captura.map(CardItem)}
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">Administração</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {outros.map(CardItem)}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
