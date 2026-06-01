
-- 1. units table
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT private.current_tenant_id(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  logo_url TEXT,
  google_reviews_url TEXT,
  public_review_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  nps_lunch_start  TIME NOT NULL DEFAULT '13:00',
  nps_lunch_end    TIME NOT NULL DEFAULT '18:00',
  nps_dinner_start TIME NOT NULL DEFAULT '18:00',
  nps_dinner_end   TIME NOT NULL DEFAULT '11:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_all ON public.units
  FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());

CREATE TRIGGER set_updated_at_units
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. unit_id columns
ALTER TABLE public.clients       ADD COLUMN unit_id UUID REFERENCES public.units(id);
ALTER TABLE public.opportunities ADD COLUMN unit_id UUID REFERENCES public.units(id);
ALTER TABLE public.contracts     ADD COLUMN unit_id UUID REFERENCES public.units(id);
ALTER TABLE public.visits        ADD COLUMN unit_id UUID REFERENCES public.units(id);
ALTER TABLE public.forms         ADD COLUMN unit_id UUID REFERENCES public.units(id);

CREATE INDEX clients_unit_id_idx       ON public.clients(unit_id);
CREATE INDEX opportunities_unit_id_idx ON public.opportunities(unit_id);
CREATE INDEX contracts_unit_id_idx     ON public.contracts(unit_id);
CREATE INDEX visits_unit_id_idx        ON public.visits(unit_id);
CREATE INDEX forms_unit_id_idx         ON public.forms(unit_id);

-- 3. tenant_role on users (no 'profiles' table in this schema)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tenant_role TEXT NOT NULL DEFAULT 'member';

-- user_units mapping
CREATE TABLE public.user_units (
  user_id UUID NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, unit_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_units TO authenticated;
GRANT ALL ON public.user_units TO service_role;

ALTER TABLE public.user_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_units_own_select ON public.user_units
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_units_owner_all ON public.user_units
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.tenant_role = 'owner'
              AND u.tenant_id = private.current_tenant_id())
    AND EXISTS (SELECT 1 FROM public.units un
                WHERE un.id = user_units.unit_id
                  AND un.tenant_id = private.current_tenant_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.tenant_role = 'owner'
              AND u.tenant_id = private.current_tenant_id())
    AND EXISTS (SELECT 1 FROM public.units un
                WHERE un.id = user_units.unit_id
                  AND un.tenant_id = private.current_tenant_id())
  );

-- 4. helper
CREATE OR REPLACE FUNCTION private.accessible_unit_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private AS $$
  SELECT u.id FROM public.units u
  WHERE u.tenant_id = private.current_tenant_id()
    AND (
      (SELECT tenant_role FROM public.users WHERE id = auth.uid()) = 'owner'
      OR u.id IN (SELECT unit_id FROM public.user_units WHERE user_id = auth.uid())
    );
$$;

-- 6. backfill units + data (run BEFORE extending policies, so the new
-- unit_id filter doesn't block the UPDATEs)
INSERT INTO public.units (tenant_id, name, slug)
SELECT DISTINCT tenant_id, 'Bosque da Saúde', 'bosque-da-saude' FROM public.users
WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO public.units (tenant_id, name, slug)
SELECT DISTINCT tenant_id, 'Vila Mariana', 'vila-mariana' FROM public.users
WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, slug) DO NOTHING;

UPDATE public.clients c
  SET unit_id = u.id FROM public.units u
  WHERE u.tenant_id = c.tenant_id AND u.slug = 'bosque-da-saude' AND c.unit_id IS NULL;
UPDATE public.opportunities c
  SET unit_id = u.id FROM public.units u
  WHERE u.tenant_id = c.tenant_id AND u.slug = 'bosque-da-saude' AND c.unit_id IS NULL;
UPDATE public.contracts c
  SET unit_id = u.id FROM public.units u
  WHERE u.tenant_id = c.tenant_id AND u.slug = 'bosque-da-saude' AND c.unit_id IS NULL;
UPDATE public.visits c
  SET unit_id = u.id FROM public.units u
  WHERE u.tenant_id = c.tenant_id AND u.slug = 'bosque-da-saude' AND c.unit_id IS NULL;
UPDATE public.forms c
  SET unit_id = u.id FROM public.units u
  WHERE u.tenant_id = c.tenant_id AND u.slug = 'bosque-da-saude' AND c.unit_id IS NULL;

UPDATE public.users SET tenant_role = 'owner' WHERE email = 'andre@kidspoint.com.br';

-- 5. extend existing policies (they are single FOR ALL policies named <table>_all)
ALTER POLICY clients_all ON public.clients
  USING (tenant_id = private.current_tenant_id()
         AND unit_id IN (SELECT private.accessible_unit_ids()))
  WITH CHECK (tenant_id = private.current_tenant_id()
              AND unit_id IN (SELECT private.accessible_unit_ids()));

ALTER POLICY opportunities_all ON public.opportunities
  USING (tenant_id = private.current_tenant_id()
         AND unit_id IN (SELECT private.accessible_unit_ids()))
  WITH CHECK (tenant_id = private.current_tenant_id()
              AND unit_id IN (SELECT private.accessible_unit_ids()));

ALTER POLICY contracts_all ON public.contracts
  USING (tenant_id = private.current_tenant_id()
         AND unit_id IN (SELECT private.accessible_unit_ids()))
  WITH CHECK (tenant_id = private.current_tenant_id()
              AND unit_id IN (SELECT private.accessible_unit_ids()));

ALTER POLICY visits_all ON public.visits
  USING (tenant_id = private.current_tenant_id()
         AND unit_id IN (SELECT private.accessible_unit_ids()))
  WITH CHECK (tenant_id = private.current_tenant_id()
              AND unit_id IN (SELECT private.accessible_unit_ids()));

ALTER POLICY forms_all ON public.forms
  USING (tenant_id = private.current_tenant_id()
         AND unit_id IN (SELECT private.accessible_unit_ids()))
  WITH CHECK (tenant_id = private.current_tenant_id()
              AND unit_id IN (SELECT private.accessible_unit_ids()));
