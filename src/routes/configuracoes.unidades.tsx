import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/configuracoes/unidades")({
  component: UnidadesPage,
});

type Unit = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  google_reviews_url: string | null;
};

function UnidadesPage() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Unit[]>([]);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && profile && profile.tenant_role !== "owner") {
      navigate({ to: "/configuracoes" });
    }
  }, [loading, profile, navigate]);

  async function load() {
    const { data } = await supabase
      .from("units")
      .select("id, name, slug, is_active, google_reviews_url")
      .order("name");
    setRows((data ?? []) as Unit[]);
  }

  useEffect(() => {
    if (profile?.tenant_role === "owner") load();
  }, [profile]);

  if (!profile || profile.tenant_role !== "owner") {
    return <AppLayout title="Unidades"><div className="text-sm text-slate-500">Carregando...</div></AppLayout>;
  }

  return (
    <AppLayout title="Unidades">
      <div className="mb-4">
        <Link to="/configuracoes" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-3.5 h-3.5" /> Configurações
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600">Gerencie as unidades do buffet.</p>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nova unidade
        </Button>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">Nenhuma unidade.</TableCell></TableRow>
            )}
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell><code className="text-xs">{u.slug}</code></TableCell>
                <TableCell><Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "Ativa" : "Inativa"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(u)}><Pencil className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(creating || editing) && (
        <UnitDialog
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </AppLayout>
  );
}

function UnitDialog({ initial, onClose, onSaved }: { initial: Unit | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [reviewsUrl, setReviewsUrl] = useState(initial?.google_reviews_url ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !slug.trim()) { toast.error("Nome e slug são obrigatórios"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(),
      slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
      is_active: isActive,
      google_reviews_url: reviewsUrl.trim() || null,
    };
    let error;
    if (initial) {
      ({ error } = await supabase.from("units").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("units").insert(payload as any));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Unidade atualizada" : "Unidade criada");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="vila-mariana" /></div>
          <div><Label>URL de avaliações Google (opcional)</Label><Input value={reviewsUrl} onChange={(e) => setReviewsUrl(e.target.value)} /></div>
          <div className="flex items-center justify-between"><Label>Ativa</Label><Switch checked={isActive} onCheckedChange={setIsActive} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
