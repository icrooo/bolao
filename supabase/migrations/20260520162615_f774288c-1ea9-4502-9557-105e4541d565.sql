
-- Add name column to predictions
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS name text;

-- Backfill existing
UPDATE public.predictions p
SET name = pr.name
FROM public.profiles pr
WHERE pr.user_id = p.user_id AND p.name IS NULL;

-- Trigger to auto-fill name from profile
CREATE OR REPLACE FUNCTION public.set_prediction_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name IS NULL OR NEW.name = '' THEN
    SELECT name INTO NEW.name FROM public.profiles WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_prediction_name ON public.predictions;
CREATE TRIGGER trg_set_prediction_name
BEFORE INSERT OR UPDATE ON public.predictions
FOR EACH ROW EXECUTE FUNCTION public.set_prediction_name();

-- Update calculate_match_scores to penalize missing predictions with -2
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
  v_user RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM public.matches WHERE id = p_match_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  DELETE FROM public.scores WHERE match_id = p_match_id;

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

    INSERT INTO public.scores (user_id, match_id, points)
    VALUES (v_pred.user_id, p_match_id, v_points);
  END LOOP;

  -- Penalize approved users who did NOT submit a prediction: -2
  FOR v_user IN
    SELECT p.user_id FROM public.profiles p
    WHERE p.is_approved = true
      AND NOT EXISTS (
        SELECT 1 FROM public.predictions pr
        WHERE pr.match_id = p_match_id AND pr.user_id = p.user_id
      )
  LOOP
    INSERT INTO public.scores (user_id, match_id, points)
    VALUES (v_user.user_id, p_match_id, -2);
  END LOOP;
END;
$function$;

-- Same for live scores (provisional penalty)
CREATE OR REPLACE FUNCTION public.calculate_live_scores(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_home_score INT;
  v_away_score INT;
  v_is_started BOOLEAN;
  v_is_finished BOOLEAN;
  v_pred RECORD;
  v_points INT;
  v_user RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT home_score, away_score, is_started, is_finished
  INTO v_home_score, v_away_score, v_is_started, v_is_finished
  FROM public.matches WHERE id = p_match_id;

  IF NOT v_is_started OR v_is_finished THEN RETURN; END IF;
  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  DELETE FROM public.scores WHERE match_id = p_match_id;

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

  FOR v_user IN
    SELECT p.user_id FROM public.profiles p
    WHERE p.is_approved = true
      AND NOT EXISTS (
        SELECT 1 FROM public.predictions pr
        WHERE pr.match_id = p_match_id AND pr.user_id = p.user_id
      )
  LOOP
    INSERT INTO public.scores (user_id, match_id, points, is_provisional)
    VALUES (v_user.user_id, p_match_id, -2, true);
  END LOOP;
END;
$function$;

-- Backfill: for already-finished matches, add -2 for users who never predicted
INSERT INTO public.scores (user_id, match_id, points)
SELECT p.user_id, m.id, -2
FROM public.matches m
CROSS JOIN public.profiles p
WHERE m.is_finished = true
  AND p.is_approved = true
  AND NOT EXISTS (
    SELECT 1 FROM public.predictions pr
    WHERE pr.match_id = m.id AND pr.user_id = p.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.scores s
    WHERE s.match_id = m.id AND s.user_id = p.user_id
  );
