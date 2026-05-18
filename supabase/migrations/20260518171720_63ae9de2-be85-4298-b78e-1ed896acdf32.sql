-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Snapshots table
CREATE TABLE public.prediction_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  prediction_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score_pred INTEGER NOT NULL,
  away_score_pred INTEGER NOT NULL,
  last_prediction_at TIMESTAMPTZ NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);

CREATE INDEX idx_prediction_snapshots_match ON public.prediction_snapshots(match_id);

ALTER TABLE public.prediction_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view snapshots"
  ON public.prediction_snapshots FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage snapshots"
  ON public.prediction_snapshots FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Snapshot function: captures predictions for matches starting within 9 minutes
CREATE OR REPLACE FUNCTION public.snapshot_predictions()
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
  SELECT
    m.id, p.id, p.user_id, pr.name, pr.email,
    m.home_team, m.away_team, p.home_score_pred, p.away_score_pred, p.created_at
  FROM public.matches m
  JOIN public.predictions p ON p.match_id = m.id
  JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE m.is_finished = false
    AND m.match_datetime <= now() + INTERVAL '9 minutes'
    AND m.match_datetime > now() - INTERVAL '1 hour'
  ON CONFLICT (match_id, user_id) DO NOTHING;
END;
$$;

-- Schedule every minute
SELECT cron.schedule(
  'snapshot-predictions-every-minute',
  '* * * * *',
  $$ SELECT public.snapshot_predictions(); $$
);