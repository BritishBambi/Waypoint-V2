CREATE TABLE user_steam_data (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id               bigint      REFERENCES games(id) ON DELETE CASCADE,
  steam_app_id          int         NOT NULL,
  playtime_minutes      int         NOT NULL DEFAULT 0,
  achievements_unlocked int         NOT NULL DEFAULT 0,
  achievements_total    int         NOT NULL DEFAULT 0,
  last_synced_at        timestamptz DEFAULT now(),
  UNIQUE(user_id, steam_app_id)
);

CREATE INDEX user_steam_data_user_id_idx ON user_steam_data(user_id);
CREATE INDEX user_steam_data_game_id_idx ON user_steam_data(game_id);

ALTER TABLE user_steam_data ENABLE ROW LEVEL SECURITY;

-- Users can manage (insert/update/delete) their own rows.
CREATE POLICY "Users can manage own steam data"
  ON user_steam_data
  FOR ALL
  USING (auth.uid() = user_id);

-- Anyone can read steam data (used for public profile playtime display).
CREATE POLICY "Public can read steam data"
  ON user_steam_data
  FOR SELECT
  USING (true);
