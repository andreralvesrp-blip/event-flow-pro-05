REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon, authenticated;