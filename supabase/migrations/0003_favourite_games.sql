-- =============================================================================
-- 0003_favourite_games.sql
-- Adds the favourite_games table. Users can pin up to 4 games on their
-- profile, ordered by position (1–4).
-- =============================================================================

CREATE TABLE favourite_games (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id     bigint      NOT NULL REFERENCES games(id)    ON DELETE CASCADE,
  position    integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Only one game per position slot per user.
  CONSTRAINT favourite_games_user_position_unique UNIQUE (user_id, position),
  -- The same game cannot appear in multiple slots.
  CONSTRAINT favourite_games_user_game_unique     UNIQUE (user_id, game_id),
  -- Position must be 1, 2, 3, or 4.
  CONSTRAINT favourite_games_position_range       CHECK  (position >= 1 AND position <= 4)
);

CREATE INDEX favourite_games_user_id_idx ON favourite_games (user_id);


-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE favourite_games ENABLE ROW LEVEL SECURITY;

-- Favourites are public: anyone can see what games a user has pinned.
CREATE POLICY "favourite_games: public read"
  ON favourite_games FOR SELECT
  USING (true);

CREATE POLICY "favourite_games: insert own"
  ON favourite_games FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "favourite_games: update own"
  ON favourite_games FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "favourite_games: delete own"
  ON favourite_games FOR DELETE
  USING (user_id = auth.uid());
