CREATE OR REPLACE FUNCTION public.get_ranking(p_date date DEFAULT NULL::date, p_group_id uuid DEFAULT NULL::uuid, p_only_finished boolean DEFAULT false)
 RETURNS TABLE(out_user_id uuid, out_name text, out_total_points bigint, out_exact_count bigint, out_partial_count bigint, out_negative_count bigint, out_missed_count bigint, out_position integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
  v_pos INT := 0;
  v_last_total BIGINT := NULL;
  v_last_exact BIGINT := NULL;
  v_last_partial BIGINT := NULL;
  v_last_missed BIGINT := NULL;
  v_last_negative BIGINT := NULL;
  v_row_num INT := 0;
  v_tz TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = 'America/Bahia') THEN
    v_tz := 'America/Bahia';
  ELSE
    v_tz := 'America/Sao_Paulo';
  END IF;

  FOR v_rec IN
    EXECUTE format($q$
      WITH approved_users AS (
        SELECT p.user_id, p.name
        FROM profiles p
        WHERE p.is_approved = true
          AND ($2::uuid IS NULL OR EXISTS (
            SELECT 1 FROM user_friendship_groups ufg
            WHERE ufg.user_id = p.user_id AND ufg.group_id = $2
          ))
      ),
      relevant_matches AS (
        SELECT m.id, m.is_finished
        FROM matches m
        WHERE (
          CASE WHEN $3 THEN m.is_finished = true
               ELSE (m.is_finished = true OR (m.is_started = true AND m.is_finished = false))
          END
        )
        AND (
          $1::date IS NULL
          OR ((m.match_datetime AT TIME ZONE %L) - INTERVAL '4 hours')::date = $1
        )
      ),
      user_scores AS (
        SELECT
          au.user_id,
          au.name,
          COALESCE(SUM(s.points), 0) AS total_points,
          COALESCE(SUM(CASE WHEN s.points = 5 THEN 1 ELSE 0 END), 0) AS exact_count,
          COALESCE(SUM(CASE WHEN s.points = 2 THEN 1 ELSE 0 END), 0) AS partial_count,
          COALESCE(SUM(CASE WHEN s.points = -1 THEN 1 ELSE 0 END), 0) AS negative_count,
          (SELECT COUNT(*)
           FROM matches fm
           WHERE fm.is_finished = true
             AND ($1::date IS NULL
                  OR ((fm.match_datetime AT TIME ZONE %L) - INTERVAL '4 hours')::date = $1)
             AND NOT EXISTS (
               SELECT 1 FROM predictions pred
               WHERE pred.user_id = au.user_id AND pred.match_id = fm.id
             )
          ) AS missed_count
        FROM approved_users au
        LEFT JOIN scores s ON s.user_id = au.user_id
          AND s.match_id IN (SELECT id FROM relevant_matches)
        GROUP BY au.user_id, au.name
      )
      SELECT * FROM user_scores
      ORDER BY total_points DESC, exact_count DESC, partial_count DESC, missed_count ASC, negative_count ASC, name ASC
    $q$, v_tz, v_tz)
  USING p_date, p_group_id, p_only_finished
  LOOP
    v_row_num := v_row_num + 1;
    IF v_last_total IS NULL
       OR v_rec.total_points != v_last_total
       OR v_rec.exact_count != v_last_exact
       OR v_rec.partial_count != v_last_partial
       OR v_rec.missed_count != v_last_missed
       OR v_rec.negative_count != v_last_negative THEN
      v_pos := v_row_num;
    END IF;
    v_last_total := v_rec.total_points;
    v_last_exact := v_rec.exact_count;
    v_last_partial := v_rec.partial_count;
    v_last_missed := v_rec.missed_count;
    v_last_negative := v_rec.negative_count;

    out_user_id := v_rec.user_id;
    out_name := v_rec.name;
    out_total_points := v_rec.total_points;
    out_exact_count := v_rec.exact_count;
    out_partial_count := v_rec.partial_count;
    out_negative_count := v_rec.negative_count;
    out_missed_count := v_rec.missed_count;
    out_position := v_pos;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_rank(p_user_id uuid)
 RETURNS TABLE(user_position integer, total_points bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT p.user_id,
           COALESCE(SUM(s.points), 0)::bigint AS total,
           COALESCE(SUM(CASE WHEN s.points = 5 THEN 1 ELSE 0 END), 0)::bigint AS exact_c,
           COALESCE(SUM(CASE WHEN s.points = 2 THEN 1 ELSE 0 END), 0)::bigint AS partial_c,
           COALESCE(SUM(CASE WHEN s.points = -2 THEN 1 ELSE 0 END), 0)::bigint AS missed_c,
           COALESCE(SUM(CASE WHEN s.points = -1 THEN 1 ELSE 0 END), 0)::bigint AS neg_c
    FROM public.profiles p
    LEFT JOIN public.scores s ON s.user_id = p.user_id
    WHERE p.is_approved = true
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT a.*,
           DENSE_RANK() OVER (ORDER BY a.total DESC, a.exact_c DESC, a.partial_c DESC, a.missed_c ASC, a.neg_c ASC)::int AS pos
    FROM agg a
  )
  SELECT r.pos, r.total FROM ranked r WHERE r.user_id = p_user_id;
END;
$function$;