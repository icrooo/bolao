
-- 1. Change group_name from character(1) to text
ALTER TABLE public.matches ALTER COLUMN group_name TYPE text;

-- 2. Update RLS policy for predictions: change 30 min lock to 10 min
DROP POLICY IF EXISTS "Users can insert own predictions before lock" ON public.predictions;
CREATE POLICY "Users can insert own predictions before lock"
ON public.predictions FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id) AND is_approved(auth.uid()) AND
  (EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = predictions.match_id
      AND matches.match_datetime > (now() + '00:10:00'::interval)
      AND matches.is_finished = false
  ))
);

DROP POLICY IF EXISTS "Users can update own predictions before lock" ON public.predictions;
CREATE POLICY "Users can update own predictions before lock"
ON public.predictions FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id) AND
  (EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = predictions.match_id
      AND matches.match_datetime > (now() + '00:10:00'::interval)
      AND matches.is_finished = false
  ))
);

-- 3. Allow authenticated users to view predictions for locked (but not finished) matches
DROP POLICY IF EXISTS "Users can view predictions for locked matches" ON public.predictions;
CREATE POLICY "Users can view predictions for locked matches"
ON public.predictions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM matches
    WHERE matches.id = predictions.match_id
      AND matches.match_datetime <= (now() + '00:10:00'::interval)
  )
);
