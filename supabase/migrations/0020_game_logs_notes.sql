-- 0020_game_logs_notes.sql
-- Add a private notes field to game_logs.
-- Nullable, no default. Never exposed publicly — only visible to the log owner.

ALTER TABLE game_logs
  ADD COLUMN IF NOT EXISTS notes text;
