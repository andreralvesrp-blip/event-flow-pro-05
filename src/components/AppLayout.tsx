import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, PartyPopper, LogOut, Webhook, DollarSign, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/browser-client";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/festas", label: "Festas", icon: PartyPopper },
  { to: "/financeiro", label: "Financeiro", icon: DollarSign },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

const roleLabel = { vendedor: "Vendedor", gestor: "Gestor", admin: "Admin" } as const;

export function AppLayout({ title, children }: { title: string; children: ReactNode }) {
  const { profile, signOut, session, loading } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [buffetName, setBuffetName] = useState("");

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "nome_buffet")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setBuffetName(data.value);
      });
  }, [profile]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Carregando...
      </div>
    );
  }

  async function handleLogout() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-[220px] shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="text-base font-semibold text-slate-900 truncate">
            {buffetName || "—"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Gestão comercial</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-900 font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100">
          <div className="text-sm font-medium text-slate-900 truncate">
            {profile?.full_name ?? "—"}
          </div>
          <div className="text-xs text-slate-500 mb-3">
            ({profile ? roleLabel[profile.role] : "—"})
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-8 border-b border-slate-200 bg-white flex items-center">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        </header>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}

export function PlaceholderCard({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-xl bg-white border border-slate-200 rounded-lg p-6">
      <p className="text-sm text-slate-600">{children}</p>
    </div>
  );
}
