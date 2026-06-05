import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CheckCircle2, AlertCircle, RefreshCw, Unplug } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  getGa4Status,
  startGa4Connect,
  disconnectGa4,
  listGa4Properties,
  setGa4Property,
  type Ga4Status,
} from "@/lib/ga4.functions";

export const Route = createFileRoute("/configuracoes/integracoes")({
  component: IntegracoesPage,
  validateSearch: (s: Record<string, unknown>) => ({
    ga4: typeof s.ga4 === "string" ? (s.ga4 as string) : undefined,
    reason: typeof s.reason === "string" ? (s.reason as string) : undefined,
  }),
});

function IntegracoesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.tenant_role === "owner";
  const search = useSearch({ from: "/configuracoes/integracoes" });

  const [status, setStatus] = useState<Ga4Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [properties, setProperties] = useState<{ id: string; name: string; account: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useServerFn(getGa4Status);
  const start = useServerFn(startGa4Connect);
  const disconnect = useServerFn(disconnectGa4);
  const listProps = useServerFn(listGa4Properties);
  const setProp = useServerFn(setGa4Property);

  async function refresh() {
    try {
      const s = await fetchStatus({});
      setStatus(s);
      if (s.connected && !s.property_id) {
        try {
          const r = await listProps({});
          setProperties(r.properties);
        } catch (e) {
          setError((e as Error).message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onConnect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await start({});
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!confirm("Desconectar o Google Analytics deste tenant?")) return;
    setBusy(true);
    try {
      await disconnect({});
      setProperties(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onPick(id: string) {
    setBusy(true);
    try {
      await setProp({ data: { property_id: id } });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout title="Integrações">
      <div className="max-w-3xl space-y-6">
        {search.ga4 === "connected" && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Google Analytics conectado com sucesso.
          </div>
        )}
        {search.ga4 === "error" && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded p-3 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Falha ao conectar GA4: {search.reason ?? "desconhecido"}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <BarChart3 className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Google Analytics 4</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Conecte a propriedade GA4 do tenant para alimentar sessões, usuários e aberturas
                  do formulário na aba Marketing. A conexão vale para todas as unidades do tenant.
                </p>
                {status?.connected && (
                  <div className="mt-3 text-xs text-slate-700 space-y-1">
                    <div>
                      <span className="text-slate-500">Conta Google: </span>
                      <span className="font-medium">{status.google_email ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Propriedade: </span>
                      <span className="font-medium">{status.property_id ?? "ainda não selecionada"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {!isAdmin && (
                <span className="text-[10px] uppercase text-slate-400">somente admin/owner</span>
              )}
              {isAdmin && !status?.connected && (
                <Button size="sm" onClick={onConnect} disabled={busy}>
                  Conectar Google Analytics
                </Button>
              )}
              {isAdmin && status?.connected && (
                <>
                  <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Atualizar
                  </Button>
                  <Button size="sm" variant="outline" onClick={onDisconnect} disabled={busy}>
                    <Unplug className="w-3 h-3 mr-1" /> Desconectar
                  </Button>
                </>
              )}
            </div>
          </div>

          {isAdmin && status?.connected && properties && (
            <div className="mt-4 border-t pt-4">
              <div className="text-xs font-medium text-slate-700 mb-2">
                Selecione a propriedade GA4
              </div>
              <div className="space-y-1 max-h-72 overflow-auto">
                {properties.length === 0 && (
                  <div className="text-xs text-slate-500">Nenhuma propriedade GA4 encontrada nesta conta Google.</div>
                )}
                {properties.map((p) => (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => onPick(p.id)}
                    className={`w-full text-left text-xs px-3 py-2 border rounded hover:bg-slate-50 ${
                      status.property_id === p.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200"
                    }`}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-slate-500">{p.account} · ID {p.id}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-rose-700">{error}</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
