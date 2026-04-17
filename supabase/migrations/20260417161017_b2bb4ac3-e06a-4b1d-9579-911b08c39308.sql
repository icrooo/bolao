-- Create table for Neymar mini game high scores
CREATE TABLE public.neymar_game_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  high_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.neymar_game_scores ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view scores (for the ranking)
CREATE POLICY "Authenticated can view game scores"
ON public.neymar_game_scores
FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own score row
CREATE POLICY "Users can insert own game score"
ON public.neymar_game_scores
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own score row
CREATE POLICY "Users can update own game score"
ON public.neymar_game_scores
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Reuse / create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_neymar_game_scores_updated_at
BEFORE UPDATE ON public.neymar_game_scores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for ranking ordering
CREATE INDEX idx_neymar_game_scores_ranking
ON public.neymar_game_scores (high_score DESC, updated_at ASC);