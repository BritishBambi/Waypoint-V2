ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_app_id int;

CREATE INDEX IF NOT EXISTS games_steam_app_id_idx ON games(steam_app_id);
