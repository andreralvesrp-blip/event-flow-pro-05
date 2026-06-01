import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/browser-client";
import { useAuth } from "@/hooks/useAuth";

export type UnitLite = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

type UnitCtxValue = {
  loading: boolean;
  units: UnitLite[];                 // unidades acessíveis ao usuário
  isOwner: boolean;
  selectedUnitId: string | "all";    // "all" = sem filtro de visão
  setSelectedUnitId: (v: string | "all") => void;
  /** Para queries: aplique .eq("unit_id", unitFilter) se != null */
  unitFilter: string | null;
  /** Para criação: unidade que será gravada. null = obrigar usuário a escolher. */
  defaultCreateUnitId: string | null;
  /** Owner em "Todas" precisa escolher a unidade no formulário de criação */
  mustChooseUnit: boolean;
  refresh: () => Promise<void>;
};

const STORAGE_KEY = "kp.selectedUnitId";

const Ctx = createContext<UnitCtxValue | undefined>(undefined);

export function UnitProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [units, setUnits] = useState<UnitLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitIdState] = useState<string | "all">("all");

  const isOwner = profile?.tenant_role === "owner";

  async function load() {
    if (!profile) return;
    setLoading(true);
    let list: UnitLite[] = [];
    if (profile.tenant_role === "owner") {
      const { data } = await supabase
        .from("units")
        .select("id, name, slug, is_active")
        .eq("is_active", true)
        .order("name");
      list = (data ?? []) as UnitLite[];
    } else {
      const { data } = await supabase
        .from("user_units")
        .select("unit:units(id, name, slug, is_active)")
        .eq("user_id", profile.id);
      list = ((data ?? []) as any[])
        .map((r) => (Array.isArray(r.unit) ? r.unit[0] : r.unit))
        .filter((u: UnitLite | null): u is UnitLite => !!u && u.is_active)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    setUnits(list);

    // Resolver seleção persistida
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    const validStored =
      stored && (stored === "all" || list.some((u) => u.id === stored)) ? stored : null;

    if (validStored) {
      setSelectedUnitIdState(validStored as string | "all");
    } else if (list.length === 1 && profile.tenant_role !== "owner") {
      setSelectedUnitIdState(list[0].id);
    } else {
      setSelectedUnitIdState("all");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function setSelectedUnitId(v: string | "all") {
    setSelectedUnitIdState(v);
    if (typeof window !== "undefined") sessionStorage.setItem(STORAGE_KEY, v);
  }

  const value = useMemo<UnitCtxValue>(() => {
    const unitFilter = selectedUnitId === "all" ? null : selectedUnitId;
    let defaultCreateUnitId: string | null = null;
    if (unitFilter) {
      defaultCreateUnitId = unitFilter;
    } else if (units.length === 1) {
      defaultCreateUnitId = units[0].id;
    } else {
      defaultCreateUnitId = null;
    }
    return {
      loading,
      units,
      isOwner,
      selectedUnitId,
      setSelectedUnitId,
      unitFilter,
      defaultCreateUnitId,
      mustChooseUnit: defaultCreateUnitId === null,
      refresh: load,
    };
  }, [loading, units, isOwner, selectedUnitId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnit() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUnit must be used within UnitProvider");
  return ctx;
}
