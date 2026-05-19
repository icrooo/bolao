
-- Add admin guard inside each function so granting EXECUTE to authenticated is safe
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.snapshot_predictions_for_match(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  INSERT INTO public.prediction_snapshots (
    match_id, prediction_id, user_id, name, email,
    home_team, away_team, home_score_pred, away_score_pred, last_prediction_at
  )
  SELECT m.id, p.id, p.user_id, pr.name, pr.email,
         m.home_team, m.away_team, p.home_score_pred, p.away_score_pred, p.updated_at
  FROM public.matches m
  JOIN public.predictions p ON p.match_id = m.id
  JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE m.id = p_match_id
  ON CONFLICT (match_id, user_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_match_snapshot(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_when timestamptz;
  v_utc  timestamp;
  v_cron text;
  v_job_name text;
  v_cmd text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT match_datetime - INTERVAL '9 minutes'
    INTO v_when
  FROM public.matches WHERE id = p_match_id;

  IF v_when IS NULL THEN RETURN; END IF;

  v_job_name := 'snapshot_match_' || p_match_id::text;

  BEGIN
    PERFORM cron.unschedule(v_job_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF v_when <= now() THEN RETURN; END IF;

  v_utc := (v_when AT TIME ZONE 'UTC');
  v_cron := format('%s %s %s %s *',
    extract(minute from v_utc)::int,
    extract(hour   from v_utc)::int,
    extract(day    from v_utc)::int,
    extract(month  from v_utc)::int
  );

  v_cmd := format(
    'SELECT public.snapshot_predictions_for_match(%L::uuid); SELECT cron.unschedule(%L);',
    p_match_id, v_job_name
  );

  PERFORM cron.schedule(v_job_name, v_cron, v_cmd);
END;
$function$;

-- Grant EXECUTE so admins (authenticated role) can call them; admin check happens inside
GRANT EXECUTE ON FUNCTION public.calculate_match_scores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_live_scores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) TO authenticated;
