-- Add icon_hash column to games table.
-- Stores the Steam app icon hash (img_icon_url from GetOwnedGames API).
-- Icon URL: https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/{appid}/{hash}.ico

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS icon_hash text;
