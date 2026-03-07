-- Add 'backlog' as a valid game_log status.
-- The status column uses a CHECK constraint, so we drop and recreate it.

ALTER TABLE game_logs
  DROP CONSTRAINT IF EXISTS game_logs_status_check;

ALTER TABLE game_logs
  ADD CONSTRAINT game_logs_status_check
    CHECK (status IN ('playing', 'played', 'wishlist', 'dropped', 'shelved', 'backlog'));

-- Notify PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
