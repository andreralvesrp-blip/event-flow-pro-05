import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/configuracoes/equipe")({
  component: EquipePage,
});

type Member = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  tenant_role: "owner" | "member";
  active: boolean;
};
type Unit = { id: string; name: string };

function EquipePage() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<Member[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);

  useEffect(() => {
    if (!loading && profile && profile.tenant_role !== "owner") {
      navigate({ to: "/configuracoes" });
    }
  }, [loading, profile, navigate]);

  async function load() {
    const [{ data: u }, { data: un }] = await Promise.all([
      supabase.from("users").select("id, full_name, email, role, tenant_role, active").order("full_name"),
      supabase.from("units").select("id, name").eq("is_active", true).order("name"),
    ]);
    setUsers((u ?? []) as Member[]);
    setUnits((un ?? []) as Unit[]);
  }

  useEffect(() => {
    if (profile?.tenant_role === "owner") load();
  }, [profile]);

  if (!profile || profile.tenant_role !== "owner") {
    return <AppLayout title="Equipe"><div className="text-sm text-slate-500">Carregando...</div></AppLayout>;
  }

  return (
    <AppLayout title="Equipe">
      <div className="mb-4">
        <Link to="/configuracoes" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-3.5 h-3.5" /> Configurações
        </Link>
      </div>
      <p className="text-sm text-slate-600 mb-6">Gerencie quais unidades cada pessoa pode acessar.</p>
      <div className="bg-white border border-slate-200 rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell className="text-sm text-slate-600">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.tenant_role === "owner" ? "default" : "secondary"}>
                    {u.tenant_role === "owner" ? "Owner" : "Member"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {u.tenant_role !== "owner" && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && (
        <UnitsDialog
          user={editing}
          units={units}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </AppLayout>
  );
}

function UnitsDialog({ user, units, onClose, onSaved }: { user: Member; units: Unit[]; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("user_units").select("unit_id").eq("user_id", user.id).then(({ data }) => {
      setSelected(new Set((data ?? []).map((r: any) => r.unit_id)));
    });
  }, [user.id]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function save() {
    setSaving(true);
    const { error: de } = await supabase.from("user_units").delete().eq("user_id", user.id);
    if (de) { setSaving(false); toast.error(de.message); return; }
    if (selected.size > 0) {
      const rows = Array.from(selected).map((unit_id) => ({ user_id: user.id, unit_id }));
      const { error: ie } = await supabase.from("user_units").insert(rows as any);
      if (ie) { setSaving(false); toast.error(ie.message); return; }
    }
    setSaving(false);
    toast.success("Acessos atualizados");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Unidades de {user.full_name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {units.length === 0 && <p className="text-sm text-slate-500">Nenhuma unidade ativa.</p>}
          {units.map((u) => (
            <label key={u.id} className="flex items-center gap-2 cursor-pointer py-1">
              <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
              <span className="text-sm">{u.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
