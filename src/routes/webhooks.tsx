import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";

type Event = {
  id: string;
  received_at: string;
  event_name: string | null;
  document_key: string | null;
  processed: boolean;
  processing_error: string | null;
};

export const Route = createFileRoute("/webhooks")({
  component: WebhooksPage,
});

function WebhooksPage() {
  const { session } = useAuth();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("clicksign_webhook_events")
      .select("id, received_at, event_name, document_key, processed, processing_error")
      .order("received_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setEvents((data ?? []) as Event[]);
      });
  }, [session]);

  return (
    <AppLayout title="Webhooks">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {err && <div className="p-4 text-sm text-red-600">{err}</div>}
        {!events && !err && (
          <div className="p-6 text-sm text-slate-500">Carregando...</div>
        )}
        {events && events.length === 0 && (
          <div className="p-6 text-sm text-slate-500">
            Nenhum webhook recebido ainda.
          </div>
        )}
        {events && events.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Recebido</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Document key</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {new Date(e.received_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.event_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {e.document_key ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {e.processed ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                        processado
                      </span>
                    ) : e.processing_error ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
                        erro
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                        pendente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                    {e.processing_error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
