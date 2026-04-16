
-- Add is_provisional column to scores
ALTER TABLE public.scores ADD COLUMN is_provisional BOOLEAN NOT NULL DEFAULT false;

-- Create calculate_live_scores function
CREATE OR REPLACE FUNCTION public.calculate_live_scores(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_home_score INT;
  v_away_score INT;
  v_is_started BOOLEAN;
  v_is_finished BOOLEAN;
  v_pred RECORD;
  v_points INT;
BEGIN
  SELECT home_score, away_score, is_started, is_finished
  INTO v_home_score, v_away_score, v_is_started, v_is_finished
  FROM public.matches WHERE id = p_match_id;

  -- Only run for in-progress matches
  IF NOT v_is_started OR v_is_finished THEN RETURN; END IF;
  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  -- Delete existing provisional scores for this match
  DELETE FROM public.scores WHERE match_id = p_match_id AND is_provisional = true;

  FOR v_pred IN
    SELECT * FROM public.predictions WHERE match_id = p_match_id
  LOOP
    IF v_pred.home_score_pred = v_home_score AND v_pred.away_score_pred = v_away_score THEN
      v_points := 5;
    ELSIF v_pred.home_score_pred = v_away_score AND v_pred.away_score_pred = v_home_score THEN
      v_points := -1;
    ELSIF (v_pred.home_score_pred > v_pred.away_score_pred AND v_home_score > v_away_score) OR
          (v_pred.home_score_pred < v_pred.away_score_pred AND v_home_score < v_away_score) OR
          (v_pred.home_score_pred = v_pred.away_score_pred AND v_home_score = v_away_score) THEN
      v_points := 2;
    ELSE
      v_points := 0;
    END IF;

    INSERT INTO public.scores (user_id, match_id, points, is_provisional)
    VALUES (v_pred.user_id, p_match_id, v_points, true);
  END LOOP;
END;
$$;
