
-- Add ON DELETE CASCADE to scores and predictions foreign keys referencing matches
ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_match_id_fkey;
ALTER TABLE public.scores ADD CONSTRAINT scores_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE public.predictions DROP CONSTRAINT IF EXISTS predictions_match_id_fkey;
ALTER TABLE public.predictions ADD CONSTRAINT predictions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

-- Add RLS policy for admin to delete matches (already has ALL policy, but ensure predictions can be deleted too)
CREATE POLICY "Admins can delete predictions" ON public.predictions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
