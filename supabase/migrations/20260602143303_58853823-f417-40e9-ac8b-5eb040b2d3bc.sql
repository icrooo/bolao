CREATE OR REPLACE FUNCTION public.admin_adjust_score(
  p_match_id uuid,
  p_field text,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_home INT;
  v_away INT;
  v_is_started BOOLEAN;
  v_is_finished BOOLEAN;
  v_new_home INT;
  v_new_away INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  IF p_field NOT IN ('home_score', 'away_score') THEN
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;

  SELECT home_score, away_score, is_started, is_finished
  INTO v_home, v_away, v_is_started, v_is_finished
  FROM public.matches WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_new_home := COALESCE(v_home, 0);
  v_new_away := COALESCE(v_away, 0);

  IF p_field = 'home_score' THEN
    v_new_home := GREATEST(0, COALESCE(v_home, 0) + p_delta);
  ELSE
    v_new_away := GREATEST(0, COALESCE(v_away, 0) + p_delta);
  END IF;

  UPDATE public.matches
  SET home_score = v_new_home,
      away_score = v_new_away
  WHERE id = p_match_id;

  IF v_is_started AND NOT v_is_finished THEN
    PERFORM public.calculate_live_scores(p_match_id);
  ELSIF v_is_finished THEN
    PERFORM public.calculate_match_scores(p_match_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_score(uuid, text, integer) TO authenticated;