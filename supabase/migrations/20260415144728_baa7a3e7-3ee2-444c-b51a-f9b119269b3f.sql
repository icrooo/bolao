
CREATE OR REPLACE FUNCTION public.get_ranking(
  p_date DATE DEFAULT NULL,
  p_group_id UUID DEFAULT NULL
)
RETURNS TABLE(
  out_user_id UUID,
  out_name TEXT,
  out_total_points BIGINT,
  out_exact_count BIGINT,
  out_partial_count BIGINT,
  out_negative_count BIGINT,
  out_missed_count BIGINT,
  out_position INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_pos INT := 0;
  v_last_total BIGINT := NULL;
  v_last_exact BIGINT := NULL;
  v_last_partial BIGINT := NULL;
  v_last_negative BIGINT := NULL;
  v_row_num INT := 0;
BEGIN
  FOR v_rec IN
    WITH approved_users AS (
      SELECT p.user_id, p.name
      FROM profiles p
      WHERE p.is_approved = true
        AND (p_group_id IS NULL OR EXISTS (
          SELECT 1 FROM user_friendship_groups ufg
          WHERE ufg.user_id = p.user_id AND ufg.group_id = p_group_id
        ))
    ),
    relevant_matches AS (
      SELECT m.id
      FROM matches m
      WHERE m.is_finished = true
        AND (p_date IS NULL OR m.match_datetime::date = p_date)
    ),
    user_scores AS (
      SELECT
        au.user_id,
        au.name,
        COALESCE(SUM(s.points), 0) AS total_points,
        COALESCE(SUM(CASE WHEN s.points = 5 THEN 1 ELSE 0 END), 0) AS exact_count,
        COALESCE(SUM(CASE WHEN s.points = 2 THEN 1 ELSE 0 END), 0) AS partial_count,
        COALESCE(SUM(CASE WHEN s.points = -1 THEN 1 ELSE 0 END), 0) AS negative_count,
        (SELECT COUNT(*) FROM relevant_matches rm
         WHERE NOT EXISTS (
           SELECT 1 FROM predictions pred
           WHERE pred.user_id = au.user_id AND pred.match_id = rm.id
         )
        ) AS missed_count
      FROM approved_users au
      LEFT JOIN scores s ON s.user_id = au.user_id
        AND s.match_id IN (SELECT id FROM relevant_matches)
      GROUP BY au.user_id, au.name
    )
    SELECT * FROM user_scores
    ORDER BY total_points DESC, exact_count DESC, partial_count DESC, negative_count ASC, name ASC
  LOOP
    v_row_num := v_row_num + 1;
    IF v_last_total IS NULL
       OR v_rec.total_points != v_last_total
       OR v_rec.exact_count != v_last_exact
       OR v_rec.partial_count != v_last_partial
       OR v_rec.negative_count != v_last_negative THEN
      v_pos := v_row_num;
    END IF;
    v_last_total := v_rec.total_points;
    v_last_exact := v_rec.exact_count;
    v_last_partial := v_rec.partial_count;
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
$$;
