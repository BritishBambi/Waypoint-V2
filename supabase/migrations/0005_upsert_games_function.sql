-- =============================================================================
-- 0005_upsert_games_function.sql
-- Creates a function to upsert games from client-side. Runs with elevated
-- privileges so authenticated users can add games without hitting RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_games(
  game_data JSONB
)
RETURNS TABLE (success boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  games_array JSONB;
  game JSONB;
BEGIN
  -- Expect an array of game objects
  games_array := game_data;
  
  IF games_array IS NULL OR games_array = 'null'::jsonb THEN
    RETURN QUERY SELECT false, 'game_data must not be null'::text;
    RETURN;
  END IF;
  
  -- Upsert each game
  FOR game IN SELECT jsonb_array_elements(games_array)
  LOOP
    INSERT INTO games (id, slug, title, cover_url)
    VALUES (
      (game->>'id')::bigint,
      game->>'slug',
      game->>'title',
      game->>'cover_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET
      slug = EXCLUDED.slug,
      title = EXCLUDED.title,
      cover_url = EXCLUDED.cover_url
    WHERE games.id = EXCLUDED.id;
  END LOOP;
  
  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION upsert_games(JSONB) TO authenticated;
