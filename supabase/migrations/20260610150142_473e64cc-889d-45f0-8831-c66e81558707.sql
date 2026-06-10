CREATE OR REPLACE FUNCTION public.get_approved_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.profiles WHERE is_approved = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_approved_count() TO anon, authenticated;