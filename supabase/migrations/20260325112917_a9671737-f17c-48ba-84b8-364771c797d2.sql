
-- Add is_started column to matches
ALTER TABLE public.matches ADD COLUMN is_started boolean NOT NULL DEFAULT false;

-- Fix calculate_match_scores with correct scoring logic
CREATE OR REPLACE FUNCTION public.calculate_match_scores(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_home_score INT;
  v_away_score INT;
  v_pred RECORD;
  v_points INT;
BEGIN
  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM public.matches WHERE id = p_match_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  DELETE FROM public.scores WHERE match_id = p_match_id;

  FOR v_pred IN
    SELECT * FROM public.predictions WHERE match_id = p_match_id
  LOOP
    -- 1. Exact score = 5 points
    IF v_pred.home_score_pred = v_home_score AND v_pred.away_score_pred = v_away_score THEN
      v_points := 5;
    -- 2. Inverse score (swapped) = -1 point (priority over tendency)
    ELSIF v_pred.home_score_pred = v_away_score AND v_pred.away_score_pred = v_home_score THEN
      v_points := -1;
    -- 3. Correct tendency (winner/draw) = 2 points
    ELSIF (v_pred.home_score_pred > v_pred.away_score_pred AND v_home_score > v_away_score) OR
          (v_pred.home_score_pred < v_pred.away_score_pred AND v_home_score < v_away_score) OR
          (v_pred.home_score_pred = v_pred.away_score_pred AND v_home_score = v_away_score) THEN
      v_points := 2;
    -- 4. Otherwise = 0 points
    ELSE
      v_points := 0;
    END IF;

    INSERT INTO public.scores (user_id, match_id, points)
    VALUES (v_pred.user_id, p_match_id, v_points);
  END LOOP;
END;
$function$;

-- Allow admins to delete profiles
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
