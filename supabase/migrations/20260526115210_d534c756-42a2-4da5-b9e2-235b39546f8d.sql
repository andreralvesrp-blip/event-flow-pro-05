CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS users_admin_write ON public.users;

CREATE POLICY users_admin_insert
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND public.current_user_role() = 'admin'::public.user_role
);

CREATE POLICY users_admin_update
ON public.users
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND public.current_user_role() = 'admin'::public.user_role
)
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND public.current_user_role() = 'admin'::public.user_role
);

CREATE POLICY users_admin_delete
ON public.users
FOR DELETE
TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND public.current_user_role() = 'admin'::public.user_role
);