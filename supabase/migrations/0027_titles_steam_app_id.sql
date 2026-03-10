-- 0027_titles_steam_app_id.sql
-- Adds steam_app_id to titles so the edge function can match titles by
-- Steam AppID from the DB instead of a hardcoded in-code map.
-- Also inserts three new curated titles.

-- ─── Add column ───────────────────────────────────────────────────────────────

ALTER TABLE titles ADD COLUMN IF NOT EXISTS steam_app_id int;

-- ─── New titles ───────────────────────────────────────────────────────────────

INSERT INTO titles (slug, name, description, color, steam_app_id, game_id) VALUES
  (
    'cyberpunk-night-city',
    'Legend of Night City',
    '100% achievements in Cyberpunk 2077',
    '#F5C518',
    1091500,
    (SELECT id FROM games WHERE title ILIKE '%cyberpunk 2077%' LIMIT 1)
  ),
  (
    'jedi-order-survivor',
    'Order 66 Survivor',
    '100% achievements in Star Wars Jedi: Fallen Order',
    '#4FC3F7',
    1172380,
    (SELECT id FROM games WHERE title ILIKE '%fallen order%' LIMIT 1)
  ),
  (
    'elden-ring-tarnished',
    'Tarnished',
    '100% achievements in Elden Ring',
    '#C8A951',
    1245620,
    (SELECT id FROM games WHERE title ILIKE '%elden ring%' LIMIT 1)
  )
ON CONFLICT (slug) DO NOTHING;

-- ─── Populate steam_app_id for existing titles via games join ─────────────────
-- Catches any seeded row that already has game_id set.

UPDATE titles t
SET steam_app_id = g.steam_app_id
FROM games g
WHERE t.game_id = g.id
  AND g.steam_app_id IS NOT NULL
  AND t.steam_app_id IS NULL;

-- ─── Directly set steam_app_id for the original 10 seeded titles ─────────────
-- Their game_id is null (games only appear after a detail page visit),
-- so the join above won't catch them.

UPDATE titles SET steam_app_id = 620     WHERE slug = 'portal-2-tester'       AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 367520  WHERE slug = 'hollow-knight-vessel'   AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 504230  WHERE slug = 'celeste-mountain'       AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 1145360 WHERE slug = 'hades-champion'         AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 292030  WHERE slug = 'the-witcher-3-master'   AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 1245620 WHERE slug = 'elden-ring-sovereign'   AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 588650  WHERE slug = 'dead-cells-beheaded'    AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 814380  WHERE slug = 'sekiro-wolf'            AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 413150  WHERE slug = 'stardew-valley-farmer'  AND steam_app_id IS NULL;
UPDATE titles SET steam_app_id = 268910  WHERE slug = 'cuphead-hero'           AND steam_app_id IS NULL;
