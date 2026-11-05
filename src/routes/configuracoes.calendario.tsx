import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { CalendarDays, Pencil, Plus, Save, Trash2, RefreshCw } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDateSettings, saveDateSettings, saveDateHoliday, deleteDateHoliday, checkDateCalendars } from '@/lib/personal-dates.functions';
import { useAuth } from '@/hooks/useAuth';

export const Route = createFileRoute('/configuracoes/calendario')({
  head: () => ({ meta: [{ title: 'Calendário — Kids Point' }, { name: 'description', content: 'Agendas e feriados das casas Kids Point.' }, { property: 'og:title', content: 'Calendário — Kids Point' }, { property: 'og:description', content: 'Agendas e feriados das casas Kids Point.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: CalendarSettingsPage,
});
const empty = { bosque_closed: '', bosque_interest: '', vila_closed: '', vila_interest: '' };
type Holiday = { id: string; name: string; holiday_date: string };
function CalendarSettingsPage() {
  const { profile } = useAuth();
  const get = useServerFn(getDateSettings), save = useServerFn(saveDateSettings), saveHoliday = useServerFn(saveDateHoliday), remove = useServerFn(deleteDateHoliday), check = useServerFn(checkDateCalendars);
  const [settings, setSettings] = useState(empty), [holidays, setHolidays] = useState<Holiday[]>([]);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | undefined>(), [date, setDate] = useState(''), [name, setName] = useState('');
  async function refresh() {
    try { const result = await get(); setSettings(result.settings ?? empty); setHolidays(result.holidays); setReady(result.serviceAccountReady); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível carregar'); }
  }
  useEffect(() => { if (profile?.tenant_role === 'owner') void refresh(); }, [profile]);
  async function run(task: () => Promise<unknown>, success: string) { setBusy(true); setMessage(''); try { await task(); setMessage(success); await refresh(); } catch(e) { setMessage(e instanceof Error ? e.message : 'Não foi possível salvar'); } finally { setBusy(false); } }
  return <AppLayout title="Calendário"><div className="max-w-3xl space-y-8">
    {profile?.tenant_role !== 'owner' ? <p className="text-muted-foreground">Acesso restrito ao responsável da empresa.</p> : <>
      <section className="border-b border-border pb-8"><div className="flex items-center gap-2 mb-5"><CalendarDays className="size-5"/><h2 className="text-lg font-semibold">Agendas das casas</h2></div>
        <div className="grid gap-6 md:grid-cols-2">{(['bosque','vila'] as const).map(house => <div key={house} className="space-y-4"><h3 className="font-medium">{house === 'bosque' ? 'Bosque da Saúde' : 'Vila Mariana'}</h3>{(['closed','interest'] as const).map(kind => { const key = `${house}_${kind}` as keyof typeof empty; return <div key={key}><Label htmlFor={key}>{kind === 'closed' ? 'ID — festas fechadas' : 'ID — pré-reservas'}</Label><Input id={key} value={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}/></div>; })}</div>)}</div>
        <p className="mt-4 text-sm text-muted-foreground">Conta de serviço: {ready ? 'configurada' : 'aguardando chave do Google'}</p>
        <div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => run(() => save({ data: settings }), 'Agendas salvas')}><Save className="size-4"/>Salvar agendas</Button><Button variant="outline" disabled={busy || !ready} onClick={() => run(() => check(), 'Leitura das quatro agendas confirmada')}><RefreshCw className="size-4"/>Conferir leitura</Button></div>
      </section>
      <section><h2 className="text-lg font-semibold mb-4">Feriados</h2><div className="divide-y divide-border">{holidays.map(h => <div key={h.id} className="flex items-center gap-3 py-3"><time className="text-sm shrink-0">{h.holiday_date.split('-').reverse().join('/')}</time><span className="text-sm flex-1">{h.name}</span><Button size="icon" variant="ghost" title="Editar feriado" aria-label={`Editar ${h.name}`} onClick={() => { setEditing(h.id); setDate(h.holiday_date); setName(h.name); }}><Pencil className="size-4"/></Button><Button size="icon" variant="ghost" disabled={busy} aria-label={`Excluir ${h.name}`} title="Excluir feriado" onClick={() => { if (confirm(`Excluir ${h.name} da lista de feriados?`)) void run(() => remove({ data: { id: h.id } }), 'Feriado excluído'); }}><Trash2 className="size-4"/></Button></div>)}</div>
        <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void run(async () => { await saveHoliday({ data: { id: editing, holiday_date: date, name } }); setEditing(undefined); setDate(''); setName(''); }, 'Feriado salvo'); }}><div><Label htmlFor="holiday-date">Data</Label><Input id="holiday-date" type="date" required value={date} onChange={e => setDate(e.target.value)}/></div><div className="flex-1 min-w-40"><Label htmlFor="holiday-name">Feriado</Label><Input id="holiday-name" required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></div><Button disabled={busy} type="submit"><Plus className="size-4"/>{editing ? 'Salvar edição' : 'Incluir'}</Button>{editing && <Button variant="outline" onClick={() => { setEditing(undefined); setDate(''); setName(''); }}>Cancelar</Button>}</form>
      </section>
      {message && <p role="status" className="text-sm">{message}</p>}
    </>}
  </div></AppLayout>;
}