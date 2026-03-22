
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer function for approval check
CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND is_approved = true
  )
$$;

-- Profiles RLS
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User roles RLS
CREATE POLICY "Users can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Matches table
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  match_datetime TIMESTAMPTZ NOT NULL,
  group_name CHAR(1) NOT NULL,
  home_score INT,
  away_score INT,
  is_finished BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view matches" ON public.matches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage matches" ON public.matches
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Predictions table
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_score_pred INT NOT NULL,
  away_score_pred INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_id)
);
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own predictions" ON public.predictions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can view predictions for finished matches" ON public.predictions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND is_finished = true)
  );
CREATE POLICY "Users can insert own predictions before lock" ON public.predictions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    public.is_approved(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE id = match_id
      AND match_datetime > (now() + interval '30 minutes')
      AND is_finished = false
    )
  );
CREATE POLICY "Users can update own predictions before lock" ON public.predictions
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE id = match_id
      AND match_datetime > (now() + interval '30 minutes')
      AND is_finished = false
    )
  );
CREATE POLICY "Admins can view all predictions" ON public.predictions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Scores table
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  points INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, match_id)
);
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view scores" ON public.scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage scores" ON public.scores
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Function to calculate scores when a match is finished
CREATE OR REPLACE FUNCTION public.calculate_match_scores(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_score INT;
  v_away_score INT;
  v_pred RECORD;
  v_points INT;
BEGIN
  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM public.matches WHERE id = p_match_id AND is_finished = true;

  IF v_home_score IS NULL THEN RETURN; END IF;

  DELETE FROM public.scores WHERE match_id = p_match_id;

  FOR v_pred IN
    SELECT * FROM public.predictions WHERE match_id = p_match_id
  LOOP
    IF v_pred.home_score_pred = v_home_score AND v_pred.away_score_pred = v_away_score THEN
      v_points := 5;
    ELSIF (v_pred.home_score_pred > v_pred.away_score_pred AND v_home_score > v_away_score) OR
          (v_pred.home_score_pred < v_pred.away_score_pred AND v_home_score < v_away_score) OR
          (v_pred.home_score_pred = v_pred.away_score_pred AND v_home_score = v_away_score) THEN
      v_points := 2;
    ELSIF (v_pred.home_score_pred > v_pred.away_score_pred AND v_home_score < v_away_score) OR
          (v_pred.home_score_pred < v_pred.away_score_pred AND v_home_score > v_away_score) THEN
      v_points := -1;
    ELSE
      v_points := 0;
    END IF;

    INSERT INTO public.scores (user_id, match_id, points)
    VALUES (v_pred.user_id, p_match_id, v_points);
  END LOOP;
END;
$$;

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
