
-- Revoke execute from anon/authenticated on internal SECURITY DEFINER functions.
-- Keep has_role, is_approved (used by RLS) and get_ranking (called from client) accessible.

REVOKE EXECUTE ON FUNCTION public.snapshot_predictions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.snapshot_predictions_for_match(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.schedule_match_snapshot(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_schedule_match_snapshot() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.calculate_live_scores(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.calculate_match_scores(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
