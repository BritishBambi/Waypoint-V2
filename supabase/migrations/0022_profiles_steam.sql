ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS steam_id             text UNIQUE,
  ADD COLUMN IF NOT EXISTS steam_display_name   text,
  ADD COLUMN IF NOT EXISTS steam_avatar_url     text,
  ADD COLUMN IF NOT EXISTS steam_connected_at   timestamptz;
