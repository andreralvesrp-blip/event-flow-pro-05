
-- 1) contract_installments: scope by accessible unit via parent contract
DROP POLICY IF EXISTS installments_all ON public.contract_installments;

CREATE POLICY installments_all ON public.contract_installments
  TO authenticated
  USING (
    tenant_id = private.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_installments.contract_id
        AND c.tenant_id = private.current_tenant_id()
        AND c.unit_id IN (SELECT private.accessible_unit_ids())
    )
  )
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_installments.contract_id
        AND c.tenant_id = private.current_tenant_id()
        AND c.unit_id IN (SELECT private.accessible_unit_ids())
    )
  );

-- 2) Prevent privilege escalation on public.users
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role public.user_role;
  v_caller_tenant_role text;
BEGIN
  -- Service role / no auth context: allow (server-side admin code)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role, tenant_role INTO v_caller_role, v_caller_tenant_role
  FROM public.users WHERE id = auth.uid();

  -- Block demoting / changing the tenant owner unless caller is that owner
  IF OLD.tenant_role = 'owner'
     AND (NEW.tenant_role IS DISTINCT FROM OLD.tenant_role
          OR NEW.role IS DISTINCT FROM OLD.role)
     AND auth.uid() <> OLD.id
  THEN
    RAISE EXCEPTION 'cannot modify tenant owner role';
  END IF;

  -- Only the tenant owner can change role or tenant_role of other users
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.tenant_role IS DISTINCT FROM OLD.tenant_role)
     AND v_caller_tenant_role <> 'owner'
  THEN
    RAISE EXCEPTION 'only the tenant owner can change user roles';
  END IF;

  -- Prevent a user from promoting themselves
  IF auth.uid() = OLD.id
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.tenant_role IS DISTINCT FROM OLD.tenant_role)
     AND v_caller_tenant_role <> 'owner'
  THEN
    RAISE EXCEPTION 'cannot self-modify role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_prevent_role_escalation ON public.users;
CREATE TRIGGER users_prevent_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
