CREATE TABLE public.date_closures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, start_date date NOT NULL, end_date date NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (end_date >= start_date));
GRANT SELECT ON public.date_closures TO authenticated;
GRANT ALL ON public.date_closures TO service_role;
ALTER TABLE public.date_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY date_closures_read ON public.date_closures FOR SELECT TO authenticated USING (tenant_id = private.current_tenant_id());
CREATE INDEX date_closures_tenant_idx ON public.date_closures(tenant_id, start_date);