REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO postgres, service_role;