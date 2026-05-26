import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";

type Event = {
  id: string;
  received_at: string;
  event_name: string | null;
  document_key: string | null;
  status: string | null;
  processed: boolean;
  processing_error: string | null;
  processed_at: string | null;
  payload: unknown;
};

export const Route = createFileRoute("/webhooks")({
  component: WebhooksPage,
});

function WebhooksPage() {
  const { session } = useAuth();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Event | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    supabase
      .from("clicksign_webhook_events")
      .select(
        "id, received_at, event_name, document_key, status, processed, processing_error, processed_at, payload",
      )
      .order("received_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setEvents((data ?? []) as Event[]);
      });
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const reprocess = async (id: string) => {
    if (!session) return;
    setReprocessingId(id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "reprocess-clicksign-webhook",
        { body: { webhook_event_id: id } },
      );
      if (error) throw error;
      const ok = (data as { ok?: boolean })?.ok;
      setToast(ok ? "Reprocessado com sucesso" : `Erro: ${(data as { error?: string })?.error ?? "desconhecido"}`);
      load();
    } catch (e) {
      setToast(`Falha: ${(e as Error).message}`);
    } finally {
      setReprocessingId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const total = events?.length ?? 0;
  const ok = events?.filter((e) => e.processed).length ?? 0;
  const errs = events?.filter((e) => !e.processed && e.processing_error).length ?? 0;
  const pending = events?.filter((e) => !e.processed && !e.processing_error).length ?? 0;

  return (
    <AppLayout title="Webhooks">
      {/* summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card label="Total recebidos" value={total} />
        <Card label="Processados" value={ok} tone="ok" />
        <Card label="Com erro" value={errs} tone="err" />
        <Card label="Pendentes" value={pending} tone="muted" />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {err && <div className="p-4 text-sm text-red-600">{err}</div>}
        {!events && !err && <div className="p-6 text-sm text-slate-500">Carregando...</div>}
        {events && events.length === 0 && (
          <div className="p-6 text-sm text-slate-500">Nenhum webhook recebido ainda.</div>
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
                <th className="px-4 py-3 font-medium">Ações</th>
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
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => setSelected(e)}
                      className="text-xs text-slate-700 hover:text-slate-900 underline underline-offset-2 mr-3"
                    >
                      Ver payload
                    </button>
                    <button
                      onClick={() => reprocess(e.id)}
                      disabled={reprocessingId === e.id}
                      className="text-xs text-blue-700 hover:text-blue-900 underline underline-offset-2 disabled:opacity-50"
                    >
                      {reprocessingId === e.id ? "Reprocessando..." : "Reprocessar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}

      {selected && <PayloadDrawer event={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone?: "ok" | "err" | "muted" }) {
  const color =
    tone === "ok" ? "text-emerald-700" :
    tone === "err" ? "text-red-700" :
    tone === "muted" ? "text-slate-500" : "text-slate-900";
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function PayloadDrawer({ event, onClose }: { event: Event; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Payload do webhook</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <Info label="Recebido em" value={new Date(event.received_at).toLocaleString("pt-BR")} />
            <Info label="Evento" value={event.event_name ?? "—"} />
            <Info label="Status bruto" value={event.status ?? "—"} />
            <Info label="Document key" value={event.document_key ?? "—"} mono />
            <Info label="Processado" value={event.processed ? "sim" : "não"} />
            <Info label="Processado em" value={event.processed_at ? new Date(event.processed_at).toLocaleString("pt-BR") : "—"} />
          </dl>
          {event.processing_error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded">
              <div className="font-medium mb-1">Erro de processamento</div>
              <div className="whitespace-pre-wrap break-words">{event.processing_error}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Payload bruto</div>
            <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded overflow-x-auto max-h-[60vh]">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="col-span-1 text-slate-500">{label}</dt>
      <dd className={`col-span-2 text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </>
  );
}
