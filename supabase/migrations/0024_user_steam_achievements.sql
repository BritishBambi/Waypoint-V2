-- Migration: user_steam_achievements
-- Stores per-achievement data synced from Steam for each user.

CREATE TABLE user_steam_achievements (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  steam_app_id         int         NOT NULL,
  achievement_api_name text        NOT NULL,
  name                 text        NOT NULL,
  description          text,
  icon_url             text        NOT NULL,
  icon_gray_url        text        NOT NULL,
  unlocked             boolean     NOT NULL DEFAULT false,
  unlock_time          timestamptz,
  global_percent       float,
  UNIQUE (user_id, steam_app_id, achievement_api_name)
);

CREATE INDEX user_steam_achievements_user_app_idx
  ON user_steam_achievements (user_id, steam_app_id);

ALTER TABLE user_steam_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own achievements"
  ON user_steam_achievements
  FOR ALL
  USING (auth.uid() = user_id);
