import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/contexts/UnitContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Copy, Code2, Pencil, ChevronLeft, User, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/formularios")({
  component: FormulariosPage,
});

type Source =
  | "meta"
  | "ga"
  | "indicacao"
  | "veio_em_festa"
  | "offline"
  | "ja_cliente"
  | "recorrencia"
  | "outro";

const SOURCE_LABELS: Record<Source, string> = {
  meta: "Meta (Instagram/Facebook)",
  ga: "Google Ads",
  indicacao: "Indicação",
  veio_em_festa: "Veio em festa",
  offline: "Off-line",
  ja_cliente: "Já é cliente",
  recorrencia: "Recorrência",
  outro: "Outro",
};

type FormRow = {
  id: string;
  name: string;
  slug: string;
  welcome_message: string;
  source: Source;
  utm_campaign: string | null;
  active: boolean;
  created_at: string;
  widget_delay: number | null;
  widget_avatar_url: string | null;
  widget_msg_1: string | null;
  widget_msg_2: string | null;
  widget_msg_3: string | null;
  attendant_name: string | null;
  attendant_avatar_url: string | null;
  attendant_online: boolean | null;
  privacy_policy_url: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function publicOrigin(origin: string) {
  try {
    const u = new URL(origin);
    // Preview URLs (id-preview--<id>.lovable.app) exigem login Lovable.
    // Trocamos pelo domínio público estável project--<id>.lovable.app.
    u.hostname = u.hostname.replace(/^id-preview--/, "project--");
    return u.origin;
  } catch {
    return origin;
  }
}

function buildWidgetScript(row: FormRow, rawOrigin: string) {
  const origin = publicOrigin(rawOrigin);
  const formUrl = `${origin}/f/${row.slug}`;
  const delay = row.widget_delay ?? "null";
  const av = (row.widget_avatar_url ?? "").replace(/'/g, "\\'");
  const m1 = (row.widget_msg_1 ?? "").replace(/'/g, "\\'");
  const m2 = (row.widget_msg_2 ?? "").replace(/'/g, "\\'");
  const m3 = (row.widget_msg_3 ?? "").replace(/'/g, "\\'");

  return `<script>
(function(){
  var F='${formUrl}',D=${delay},AV='${av}';
  var MS=['${m1}','${m2}','${m3}'].filter(function(m){return m.trim()!=='';});
  var id='kpw'+Math.random().toString(36).substr(2,5);
  var s=document.createElement('style');
  s.textContent='#'+id+'-w{position:fixed;bottom:20px;right:20px;z-index:99998;display:flex;align-items:flex-end;gap:10px;flex-direction:row-reverse}'
    +'#'+id+'-btn{position:relative;width:60px;height:60px;border-radius:50%;overflow:visible;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.22);border:3px solid #fff;flex-shrink:0;background:#e5e7eb}'
    +'#'+id+'-btn img{width:100%;height:100%;object-fit:cover;border-radius:50%}'
    +'#'+id+'-dot{position:absolute;bottom:1px;right:1px;width:16px;height:16px;border-radius:50%;background:#25d366;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.05);animation:'+id+'-pulse 2s infinite}'
    +'@keyframes '+id+'-pulse{0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,.55)}50%{box-shadow:0 0 0 6px rgba(37,211,102,0)}}'
    +'#'+id+'-bbl{background:#fff;border-radius:16px 16px 4px 16px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.12);font-size:14px;color:#1a1a2e;line-height:1.45;max-width:220px;cursor:pointer;transition:opacity .3s;font-family:-apple-system,sans-serif}'
    +'#'+id+'-frm{position:fixed;bottom:90px;right:20px;z-index:99999;width:380px;height:600px;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.2);display:none}'
    +'#'+id+'-frm iframe{width:100%;height:100%;border:none}'
    +'#'+id+'-cls{position:absolute;top:10px;right:12px;background:rgba(0,0,0,.35);color:#fff;border:none;border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1}'
    +'@media(max-width:480px){#'+id+'-frm{width:calc(100vw - 16px);right:8px;bottom:84px;height:72vh;border-radius:16px 16px 0 0}}';
  document.head.appendChild(s);
  var av=AV?'<img src="'+AV+'" alt="">':'';
  var w=document.createElement('div'); w.id=id+'-w';
  var mi=0;
  if(MS.length>1){try{var k='kpwmi_'+F;var raw=sessionStorage.getItem(k);if(raw===null){var st=localStorage.getItem(k);mi=st?(parseInt(st,10)||0)%MS.length:0;sessionStorage.setItem(k,String(mi));localStorage.setItem(k,String((mi+1)%MS.length));}else{mi=(parseInt(raw,10)||0)%MS.length;}}catch(e){mi=0;}}
  w.innerHTML='<div id="'+id+'-btn">'+av+'<span id="'+id+'-dot"></span></div>'+(MS.length?'<div id="'+id+'-bbl">'+MS[mi]+'</div>':'');
  document.body.appendChild(w);

  var fc=document.createElement('div'); fc.id=id+'-frm';
  fc.innerHTML='<button id="'+id+'-cls">\u2715</button><iframe src="'+F+'"></iframe>';
  document.body.appendChild(fc);
  var opened=false;
  function open(){fc.style.display='block';opened=true;}
  function close(){fc.style.display='none';}
  document.getElementById(id+'-btn').onclick=function(){fc.style.display==='block'?close():open();};
  var bbl=document.getElementById(id+'-bbl');
  if(bbl){bbl.onclick=open;}
  document.getElementById(id+'-cls').onclick=close;
  if(D!==null&&typeof D==='number'&&D>=0){setTimeout(function(){if(!opened)open();},D*1000);}

})();
</script>`;
}

function FormulariosPage() {
  const { profile } = useAuth();
  const { unitFilter, units, defaultCreateUnitId, mustChooseUnit } = useUnit();
  const [rows, setRows] = useState<FormRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormRow | null>(null);
  const [creating, setCreating] = useState(false);

  const origin = publicOrigin(typeof window !== "undefined" ? window.location.origin : "");

  async function load() {
    setLoading(true);
    let q = supabase
      .from("forms")
      .select("*")
      .order("created_at", { ascending: false });
    if (unitFilter) q = q.eq("unit_id", unitFilter);
    const { data: forms } = await q;
    const list = (forms ?? []) as FormRow[];
    setRows(list);

    if (list.length) {
      const { data: opps } = await supabase
        .from("opportunities")
        .select("form_id")
        .in("form_id", list.map((f) => f.id));
      const c: Record<string, number> = {};
      for (const o of opps ?? []) {
        if (o.form_id) c[o.form_id] = (c[o.form_id] ?? 0) + 1;
      }
      setCounts(c);
    } else {
      setCounts({});
    }
    setLoading(false);
  }

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, unitFilter]);

  async function toggleActive(row: FormRow) {
    const { error } = await supabase
      .from("forms")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else load();
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("Não foi possível copiar"),
    );
  }

  function copyWidget(row: FormRow) {
    if (!row.widget_msg_1 || !row.widget_msg_1.trim()) {
      toast.warning("Configure ao menos uma mensagem antes de copiar o widget.");
      return;
    }
    const script = buildWidgetScript(row, origin);
    navigator.clipboard.writeText(script).then(
      () => toast.success("Script copiado!"),
      () => toast.error("Não foi possível copiar"),
    );
  }

  function iframeFor(slug: string) {
    return `<iframe src="${origin}/f/${slug}" style="width:100%;height:620px;border:none;border-radius:12px;" allow="clipboard-write" loading="lazy"></iframe>`;
  }

  return (
    <AppLayout title="Formulários">
      <div className="mb-4">
        <Link
          to="/configuracoes"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Configurações
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600">
          Crie formulários conversacionais para capturar leads em landings, anúncios e site.
        </p>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo formulário
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug / URL</TableHead>
              <TableHead>Canal de origem</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                  Nenhum formulário criado ainda.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  <code className="text-xs text-slate-600">/f/{r.slug}</code>
                </TableCell>
                <TableCell className="text-sm">{SOURCE_LABELS[r.source]}</TableCell>
                <TableCell className="text-right tabular-nums">{counts[r.id] ?? 0}</TableCell>
                <TableCell>
                  <Badge variant={r.active ? "default" : "secondary"}>
                    {r.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(r)}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(`${origin}/f/${r.slug}`, "Link")}
                      title="Copiar link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(iframeFor(r.slug), "Iframe")}
                      title="Copiar iframe"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyWidget(r)}
                      title="Copiar widget"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </Button>
                    <Switch
                      checked={r.active}
                      onCheckedChange={() => toggleActive(r)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(creating || editing) && (
        <FormDialog
          initial={editing}
          units={units}
          defaultUnitId={defaultCreateUnitId}
          mustChooseUnit={mustChooseUnit}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </AppLayout>
  );
}

function FormDialog({
  initial,
  units,
  defaultUnitId,
  mustChooseUnit,
  onClose,
  onSaved,
}: {
  initial: FormRow | null;
  units: { id: string; name: string }[];
  defaultUnitId: string | null;
  mustChooseUnit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [welcome, setWelcome] = useState(
    initial?.welcome_message ?? "Vamos planejar sua festa? 🎉",
  );
  const [source, setSource] = useState<Source>(initial?.source ?? "outro");
  const [utm, setUtm] = useState(initial?.utm_campaign ?? "");
  const [active, setActive] = useState(initial?.active ?? true);

  const [widgetAvatar, setWidgetAvatar] = useState(initial?.widget_avatar_url ?? "");
  const [widgetDelay, setWidgetDelay] = useState<string>(
    initial?.widget_delay != null ? String(initial.widget_delay) : "",
  );
  const [msg1, setMsg1] = useState(initial?.widget_msg_1 ?? "");
  const [msg2, setMsg2] = useState(initial?.widget_msg_2 ?? "");
  const [msg3, setMsg3] = useState(initial?.widget_msg_3 ?? "");
  const [avatarError, setAvatarError] = useState(false);
  const [chosenUnit, setChosenUnit] = useState<string>(defaultUnitId ?? "");

  const [attendantName, setAttendantName] = useState(initial?.attendant_name ?? "");
  const [attendantAvatar, setAttendantAvatar] = useState(initial?.attendant_avatar_url ?? "");
  const [attendantOnline, setAttendantOnline] = useState<boolean>(initial?.attendant_online ?? true);
  const [privacyUrl, setPrivacyUrl] = useState(initial?.privacy_policy_url ?? "");

  const [saving, setSaving] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    setAvatarError(false);
  }, [widgetAvatar]);

  const slugOk = useMemo(() => /^[a-z0-9-]+$/.test(slug) && slug.length > 0, [slug]);

  async function save() {
    if (!profile) return;
    if (!name.trim()) {
      toast.error("Informe um nome");
      return;
    }
    if (!slugOk) {
      toast.error("Slug inválido (só letras minúsculas, números e hífen)");
      return;
    }
    const unitId = chosenUnit || defaultUnitId;
    if (!initial && !unitId) {
      toast.error("Selecione a unidade");
      return;
    }
    setSaving(true);
    const delayNum = widgetDelay.trim() === "" ? null : Number(widgetDelay);
    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      welcome_message: welcome.trim() || "Vamos planejar sua festa? 🎉",
      source,
      utm_campaign: utm.trim() || null,
      active,
      widget_avatar_url: widgetAvatar.trim() || null,
      widget_delay: delayNum !== null && !Number.isNaN(delayNum) && delayNum >= 0 ? delayNum : null,
      widget_msg_1: msg1.trim() || null,
      widget_msg_2: msg2.trim() || null,
      widget_msg_3: msg3.trim() || null,
      attendant_name: attendantName.trim() || null,
      attendant_avatar_url: attendantAvatar.trim() || null,
      attendant_online: attendantOnline,
      privacy_policy_url: privacyUrl.trim() || null,
    };
    let error;
    if (initial) {
      ({ error } = await supabase.from("forms").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("forms").insert({
        ...payload,
        unit_id: unitId!,
        tenant_id: profile.tenant_id,
        created_by: profile.id,
      } as any));
    }
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("Já existe um formulário com esse slug");
      else toast.error(error.message);
      return;
    }
    toast.success(initial ? "Formulário atualizado" : "Formulário criado");
    onSaved();
  }

  const showPreviewImg = widgetAvatar.trim() !== "" && !avatarError;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar formulário" : "Novo formulário"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome (interno)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Landing Google Ads — Jun 2026"
            />
          </div>
          <div>
            <Label>Slug</Label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              placeholder="landing-google-ads-jun-2026"
            />
            <p className="text-xs text-slate-500 mt-1">
              URL: <code>{origin}/f/{slug || "..."}</code>
            </p>
          </div>
          <div>
            <Label>Mensagem de abertura</Label>
            <Textarea
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Canal de origem padrão</Label>
            <Select value={source} onValueChange={(v) => setSource(v as Source)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>UTM Campaign (opcional)</Label>
            <Input
              value={utm}
              onChange={(e) => setUtm(e.target.value)}
              placeholder="festa-junho-2026"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Ativo</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          {!initial && units.length > 1 && (
            <div>
              <Label>Unidade {mustChooseUnit ? "*" : ""}</Label>
              <Select value={chosenUnit} onValueChange={setChosenUnit}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />
          <h3 className="text-sm font-semibold text-slate-900">Widget flutuante</h3>

          <div>
            <Label>Foto de perfil</Label>
            <Input
              type="url"
              value={widgetAvatar}
              onChange={(e) => setWidgetAvatar(e.target.value)}
              placeholder="URL direta da imagem — Imgur, Cloudinary, etc."
            />
            <div className="mt-2 flex items-center gap-2">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                {showPreviewImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={widgetAvatar}
                    alt="preview"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <User className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <span className="text-xs text-slate-500">Pré-visualização</span>
            </div>
          </div>

          <div>
            <Label>Abrir automaticamente após X segundos</Label>
            <Input
              type="number"
              min={0}
              value={widgetDelay}
              onChange={(e) => setWidgetDelay(e.target.value)}
              placeholder="Segundos — ex: 10"
            />
            <p className="text-xs text-slate-500 mt-1">
              Deixe vazio para não abrir automaticamente.
            </p>
          </div>

          {[
            { label: "Mensagem 1", value: msg1, set: setMsg1, ph: "Tem festa em mente?" },
            { label: "Mensagem 2", value: msg2, set: setMsg2, ph: "Verifico a data pra você!" },
            { label: "Mensagem 3", value: msg3, set: setMsg3, ph: "Fale comigo agora" },
          ].map((m) => (
            <div key={m.label}>
              <div className="flex items-center justify-between">
                <Label>{m.label}</Label>
                <span className="text-xs text-slate-400 tabular-nums">{m.value.length}/60</span>
              </div>
              <Input
                maxLength={60}
                value={m.value}
                onChange={(e) => m.set(e.target.value)}
                placeholder={m.ph}
              />
            </div>
          ))}
          <p className="text-xs text-slate-500">
            As mensagens aparecem em rotação no botão flutuante. Use para testar qual copy gera
            mais cliques.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
