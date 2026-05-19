
-- 1. Add updated_at to predictions
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows
UPDATE public.predictions SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = now();

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS update_predictions_updated_at ON public.predictions;
CREATE TRIGGER update_predictions_updated_at
BEFORE UPDATE ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Update snapshot functions to use updated_at
CREATE OR REPLACE FUNCTION public.snapshot_predictions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.prediction_snapshots (
    match_id, prediction_id, user_id, name, email,
    home_team, away_team, home_score_pred, away_score_pred, last_prediction_at
  )
  SELECT
    m.id, p.id, p.user_id, pr.name, pr.email,
    m.home_team, m.away_team, p.home_score_pred, p.away_score_pred, p.updated_at
  FROM public.matches m
  JOIN public.predictions p ON p.match_id = m.id
  JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE m.is_finished = false
    AND m.match_datetime <= now() + INTERVAL '9 minutes'
    AND m.match_datetime > now() - INTERVAL '1 hour'
  ON CONFLICT (match_id, user_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.snapshot_predictions_for_match(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
