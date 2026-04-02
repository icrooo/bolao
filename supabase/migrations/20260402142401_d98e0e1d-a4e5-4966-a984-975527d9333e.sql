
-- Create friendship_groups table
CREATE TABLE public.friendship_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.friendship_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view friendship groups" ON public.friendship_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage friendship groups" ON public.friendship_groups
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Create user_friendship_groups junction table (max 3 per user enforced in app)
CREATE TABLE public.user_friendship_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.friendship_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

ALTER TABLE public.user_friendship_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user friendship groups" ON public.user_friendship_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage user friendship groups" ON public.user_friendship_groups
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
