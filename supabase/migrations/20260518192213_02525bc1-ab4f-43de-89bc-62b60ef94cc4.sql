
-- 1) Remove o job antigo que rodava a cada minuto
DO $$
DECLARE jid bigint;
BEGIN
  FOR jid IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%snapshot_predictions%' AND schedule = '* * * * *'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- 2) Função que tira snapshot de UMA partida
CREATE OR REPLACE FUNCTION public.snapshot_predictions_for_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.prediction_snapshots (
    match_id, prediction_id, user_id, name, email,
    home_team, away_team, home_score_pred, away_score_pred, last_prediction_at
  )
  SELECT m.id, p.id, p.user_id, pr.name, pr.email,
         m.home_team, m.away_team, p.home_score_pred, p.away_score_pred, p.created_at
  FROM public.matches m
  JOIN public.predictions p ON p.match_id = m.id
  JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE m.id = p_match_id
  ON CONFLICT (match_id, user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) FROM authenticated;

-- 3) Função que (re)agenda um job único para a partida
CREATE OR REPLACE FUNCTION public.schedule_match_snapshot(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_when timestamptz;
  v_utc  timestamp;
  v_cron text;
  v_job_name text;
  v_cmd text;
BEGIN
  SELECT match_datetime - INTERVAL '9 minutes'
    INTO v_when
  FROM public.matches WHERE id = p_match_id;

  IF v_when IS NULL THEN RETURN; END IF;

  v_job_name := 'snapshot_match_' || p_match_id::text;

  -- Sempre tenta remover job antigo (se existir) para reagendar
  BEGIN
    PERFORM cron.unschedule(v_job_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Só agenda se ainda for no futuro
  IF v_when <= now() THEN RETURN; END IF;

  v_utc := (v_when AT TIME ZONE 'UTC');
  v_cron := format('%s %s %s %s *',
    extract(minute from v_utc)::int,
    extract(hour   from v_utc)::int,
    extract(day    from v_utc)::int,
    extract(month  from v_utc)::int
  );

  -- O job tira o snapshot e se auto-desagenda
  v_cmd := format(
    'SELECT public.snapshot_predictions_for_match(%L::uuid); SELECT cron.unschedule(%L);',
    p_match_id, v_job_name
  );

  PERFORM cron.schedule(v_job_name, v_cron, v_cmd);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) FROM authenticated;

-- 4) Trigger: agenda/reagenda/desagenda automaticamente
CREATE OR REPLACE FUNCTION public.trg_schedule_match_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    BEGIN
      PERFORM cron.unschedule('snapshot_match_' || OLD.id::text);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN OLD;
  END IF;

  PERFORM public.schedule_match_snapshot(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_schedule_snapshot ON public.matches;
CREATE TRIGGER matches_schedule_snapshot
AFTER INSERT OR DELETE OR UPDATE OF match_datetime
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.trg_schedule_match_snapshot();

-- 5) Agenda jobs para todas as partidas futuras existentes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.matches
    WHERE is_finished = false
      AND match_datetime - INTERVAL '9 minutes' > now()
  LOOP
    PERFORM public.schedule_match_snapshot(r.id);
  END LOOP;
END $$;
