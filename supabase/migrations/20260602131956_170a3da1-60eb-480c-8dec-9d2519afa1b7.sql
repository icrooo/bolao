
CREATE OR REPLACE FUNCTION public.admin_start_match(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  UPDATE public.matches
    SET is_started = true,
        home_score = COALESCE(home_score, 0),
        away_score = COALESCE(away_score, 0)
    WHERE id = p_match_id;
  PERFORM public.calculate_live_scores(p_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restart_match(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  DELETE FROM public.scores WHERE match_id = p_match_id;
  UPDATE public.matches
    SET is_started = false, is_finished = false, home_score = NULL, away_score = NULL
    WHERE id = p_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finish_match(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_home INT; v_away INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;
  SELECT home_score, away_score INTO v_home, v_away FROM public.matches WHERE id = p_match_id;
  IF v_home IS NULL OR v_away IS NULL THEN
    RAISE EXCEPTION 'Match score must be set before finishing';
  END IF;
  UPDATE public.matches SET is_finished = true WHERE id = p_match_id;
  PERFORM public.calculate_match_scores(p_match_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_start_match(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_restart_match(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_finish_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_start_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restart_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finish_match(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_rank(p_user_id uuid)
RETURNS TABLE (user_position integer, total_points bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT p.user_id,
           COALESCE(SUM(s.points), 0)::bigint AS total,
           COALESCE(SUM(CASE WHEN s.points = 5 THEN 1 ELSE 0 END), 0)::bigint AS exact_c,
           COALESCE(SUM(CASE WHEN s.points = 2 THEN 1 ELSE 0 END), 0)::bigint AS partial_c,
           COALESCE(SUM(CASE WHEN s.points = -1 THEN 1 ELSE 0 END), 0)::bigint AS neg_c
    FROM public.profiles p
    LEFT JOIN public.scores s ON s.user_id = p.user_id
    WHERE p.is_approved = true
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT a.*,
           DENSE_RANK() OVER (ORDER BY a.total DESC, a.exact_c DESC, a.partial_c DESC, a.neg_c ASC)::int AS pos
    FROM agg a
  )
  SELECT r.pos, r.total FROM ranked r WHERE r.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_rank(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_rank(uuid) TO authenticated;
