CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_role() TO authenticated;

DROP POLICY IF EXISTS clients_all ON public.clients;
CREATE POLICY clients_all
ON public.clients
FOR ALL
TO authenticated
USING (tenant_id = private.current_tenant_id())
WITH CHECK (tenant_id = private.current_tenant_id());

DROP POLICY IF EXISTS contracts_all ON public.contracts;
CREATE POLICY contracts_all
ON public.contracts
FOR ALL
TO authenticated
USING (tenant_id = private.current_tenant_id())
WITH CHECK (tenant_id = private.current_tenant_id());

DROP POLICY IF EXISTS installments_all ON public.contract_installments;
CREATE POLICY installments_all
ON public.contract_installments
FOR ALL
TO authenticated
USING (tenant_id = private.current_tenant_id())
WITH CHECK (tenant_id = private.current_tenant_id());

DROP POLICY IF EXISTS settings_all ON public.system_settings;
CREATE POLICY settings_all
ON public.system_settings
FOR ALL
TO authenticated
USING (tenant_id = private.current_tenant_id())
WITH CHECK (tenant_id = private.current_tenant_id());

DROP POLICY IF EXISTS tenants_select ON public.tenants;
CREATE POLICY tenants_select
ON public.tenants
FOR SELECT
TO authenticated
USING (id = private.current_tenant_id());

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select
ON public.users
FOR SELECT
TO authenticated
USING (tenant_id = private.current_tenant_id());

DROP POLICY IF EXISTS users_admin_insert ON public.users;
CREATE POLICY users_admin_insert
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = private.current_tenant_id()
  AND private.current_user_role() = 'admin'::public.user_role
);

DROP POLICY IF EXISTS users_admin_update ON public.users;
CREATE POLICY users_admin_update
ON public.users
FOR UPDATE
TO authenticated
USING (
  tenant_id = private.current_tenant_id()
  AND private.current_user_role() = 'admin'::public.user_role
)
WITH CHECK (
  tenant_id = private.current_tenant_id()
  AND private.current_user_role() = 'admin'::public.user_role
);

DROP POLICY IF EXISTS users_admin_delete ON public.users;
CREATE POLICY users_admin_delete
ON public.users
FOR DELETE
TO authenticated
USING (
  tenant_id = private.current_tenant_id()
  AND private.current_user_role() = 'admin'::public.user_role
);