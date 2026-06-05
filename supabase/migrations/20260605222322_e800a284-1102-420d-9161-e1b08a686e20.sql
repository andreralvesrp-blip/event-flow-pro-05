
DROP POLICY IF EXISTS ga4_select_own_tenant ON public.integrations_ga4;

CREATE POLICY ga4_select_owner_admin
ON public.integrations_ga4
FOR SELECT
TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.tenant_role = 'owner')
  )
);

CREATE POLICY ga4_insert_owner_admin
ON public.integrations_ga4
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.tenant_role = 'owner')
  )
);

CREATE POLICY ga4_update_owner_admin
ON public.integrations_ga4
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.tenant_role = 'owner')
  )
)
WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.tenant_role = 'owner')
  )
);

CREATE POLICY ga4_delete_owner_admin
ON public.integrations_ga4
FOR DELETE
TO authenticated
USING (
  tenant_id = public.current_tenant_id()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.tenant_role = 'owner')
  )
);

CREATE POLICY marketing_events_insert_tenant
ON public.marketing_events
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.current_tenant_id());
