import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Copy, Code2, Pencil } from "lucide-react";
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

function FormulariosPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<FormRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormRow | null>(null);
  const [creating, setCreating] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function load() {
    setLoading(true);
    const { data: forms } = await supabase
      .from("forms")
      .select("*")
      .order("created_at", { ascending: false });
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
  }, [profile]);

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

  function iframeFor(slug: string) {
    return `<iframe src="${origin}/f/${slug}" style="width:100%;height:620px;border:none;border-radius:12px;" allow="clipboard-write" loading="lazy"></iframe>`;
  }

  return (
    <AppLayout title="Formulários">
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
  onClose,
  onSaved,
}: {
  initial: FormRow | null;
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
  const [saving, setSaving] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

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
    setSaving(true);
    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      welcome_message: welcome.trim() || "Vamos planejar sua festa? 🎉",
      source,
      utm_campaign: utm.trim() || null,
      active,
    };
    let error;
    if (initial) {
      ({ error } = await supabase.from("forms").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("forms").insert({
        ...payload,
        tenant_id: profile.tenant_id,
        created_by: profile.id,
      }));
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
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
