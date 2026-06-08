
REVOKE EXECUTE ON FUNCTION public.record_conversion_event(text, uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_visits_conversion_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_contracts_conversion_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversion_event(text, uuid, uuid, uuid, numeric) TO service_role;
