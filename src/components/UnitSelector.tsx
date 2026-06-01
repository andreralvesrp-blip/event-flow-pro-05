import { Building2, Lock } from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UnitSelector() {
  const { units, isOwner, selectedUnitId, setSelectedUnitId, loading } = useUnit();

  if (loading) {
    return <div className="text-xs text-slate-400">Carregando unidades…</div>;
  }

  // Member com 1 unidade: rótulo fixo
  if (!isOwner && units.length === 1) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-700 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md">
        <Lock className="w-3 h-3 text-slate-400" />
        <Building2 className="w-3.5 h-3.5 text-slate-500" />
        <span className="font-medium">{units[0].name}</span>
      </div>
    );
  }

  // Sem unidades acessíveis: nada a mostrar
  if (units.length === 0) {
    return <div className="text-xs text-slate-400">Sem unidade atribuída</div>;
  }

  const allLabel = isOwner ? "Todas as unidades" : "Todas (as minhas)";

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-slate-500" />
      <Select value={selectedUnitId} onValueChange={(v) => setSelectedUnitId(v)}>
        <SelectTrigger className="h-8 min-w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {units.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
