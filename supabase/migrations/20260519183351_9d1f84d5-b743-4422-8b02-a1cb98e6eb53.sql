
-- 1. Predictions UPDATE: also require approval
DROP POLICY IF EXISTS "Users can update own predictions before lock" ON public.predictions;
CREATE POLICY "Users can update own predictions before lock"
ON public.predictions
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_approved(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.matches
    WHERE matches.id = predictions.match_id
      AND matches.match_datetime > (now() + INTERVAL '10 minutes')
      AND matches.is_finished = false
  )
);

-- 2. user_roles SELECT: only own role
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Revoke EXECUTE on SECURITY DEFINER functions from anon/public,
--    keep authenticated grants only for the ones the app actually calls.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ranking(date, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_live_scores(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_match_scores(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.snapshot_predictions() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking(date, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_live_scores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_match_scores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) TO authenticated;
