
CREATE OR REPLACE FUNCTION public.prevent_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If is_approved is being changed and the caller is not an admin, revert it
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.is_approved := OLD.is_approved;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_approval ON public.profiles;
CREATE TRIGGER trg_prevent_self_approval
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_approval();
