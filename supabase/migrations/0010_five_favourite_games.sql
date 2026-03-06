-- 0010_five_favourite_games.sql
-- Extends the favourite_games position constraint from 1–4 to 1–5.

ALTER TABLE favourite_games
  DROP CONSTRAINT IF EXISTS favourite_games_position_range;

ALTER TABLE favourite_games
  ADD CONSTRAINT favourite_games_position_range
  CHECK (position >= 1 AND position <= 5);
