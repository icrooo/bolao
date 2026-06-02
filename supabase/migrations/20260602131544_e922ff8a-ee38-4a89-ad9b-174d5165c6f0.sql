
-- R4: Predictions policies must also check is_started = false
DROP POLICY IF EXISTS "Users can insert own predictions before lock" ON public.predictions;
DROP POLICY IF EXISTS "Users can update own predictions before lock" ON public.predictions;

CREATE POLICY "Users can insert own predictions before lock"
ON public.predictions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_approved(auth.uid())
  AND EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = predictions.match_id
      AND matches.match_datetime > (now() + INTERVAL '10 minutes')
      AND matches.is_finished = false
      AND matches.is_started = false
  )
);

CREATE POLICY "Users can update own predictions before lock"
ON public.predictions
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND is_approved(auth.uid())
  AND EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = predictions.match_id
      AND matches.match_datetime > (now() + INTERVAL '10 minutes')
      AND matches.is_finished = false
      AND matches.is_started = false
  )
);

-- R5: CHECK constraints on scores (0..99)
ALTER TABLE public.matches
  ADD CONSTRAINT matches_home_score_range CHECK (home_score IS NULL OR (home_score BETWEEN 0 AND 99)),
  ADD CONSTRAINT matches_away_score_range CHECK (away_score IS NULL OR (away_score BETWEEN 0 AND 99));

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_home_pred_range CHECK (home_score_pred BETWEEN 0 AND 99),
  ADD CONSTRAINT predictions_away_pred_range CHECK (away_score_pred BETWEEN 0 AND 99);

-- R6: Hide email column from non-admin authenticated users
REVOKE SELECT (email) ON public.profiles FROM authenticated;
REVOKE SELECT (email) ON public.profiles FROM anon;

-- Admin-only RPC to fetch all profiles including email
CREATE OR REPLACE FUNCTION public.admin_get_profiles()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  email text,
  is_approved boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.user_id, p.name, p.email, p.is_approved, p.created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_profiles() TO authenticated;
