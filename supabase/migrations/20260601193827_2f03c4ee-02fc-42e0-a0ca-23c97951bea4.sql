-- CR-03: index for scores.match_id
CREATE INDEX IF NOT EXISTS idx_scores_match_id ON public.scores(match_id);

-- CR-07: switch realtime replica identity from FULL to DEFAULT to shrink payloads
ALTER TABLE public.scores REPLICA IDENTITY DEFAULT;
ALTER TABLE public.matches REPLICA IDENTITY DEFAULT;

-- CR-02: replace DELETE+INSERT with UPSERT to remove race window
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
    VALUES (v_pred.user_id, p_match_id, v_points, false)
    ON CONFLICT (user_id, match_id)
    DO UPDATE SET points = EXCLUDED.points, is_provisional = false;
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
    INSERT INTO public.scores (user_id, match_id, points, is_provisional)
    VALUES (v_user.user_id, p_match_id, -2, false)
    ON CONFLICT (user_id, match_id)
    DO UPDATE SET points = -2, is_provisional = false;
  END LOOP;

  -- Remove stale rows (predictions removed or users unapproved after previous run)
  DELETE FROM public.scores s
  WHERE s.match_id = p_match_id
    AND NOT EXISTS (
      SELECT 1 FROM public.predictions p WHERE p.match_id = p_match_id AND p.user_id = s.user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.user_id = s.user_id AND pr.is_approved = true
    );
END;
$function$;

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
    VALUES (v_pred.user_id, p_match_id, v_points, true)
    ON CONFLICT (user_id, match_id)
    DO UPDATE SET points = EXCLUDED.points, is_provisional = true;
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
    VALUES (v_user.user_id, p_match_id, -2, true)
    ON CONFLICT (user_id, match_id)
    DO UPDATE SET points = -2, is_provisional = true;
  END LOOP;

  -- Remove stale rows
  DELETE FROM public.scores s
  WHERE s.match_id = p_match_id
    AND NOT EXISTS (
      SELECT 1 FROM public.predictions p WHERE p.match_id = p_match_id AND p.user_id = s.user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.user_id = s.user_id AND pr.is_approved = true
    );
END;
$function$;