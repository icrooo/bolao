
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_ranking(date, uuid, boolean) FROM anon, public;
