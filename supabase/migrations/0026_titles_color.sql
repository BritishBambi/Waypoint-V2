-- 0026_titles_color.sql
ALTER TABLE titles
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#FFFFFF';

UPDATE titles SET color = '#F5C518' WHERE name ILIKE '%Night City%';
UPDATE titles SET color = '#C8A951' WHERE name ILIKE '%Tarnished%';
UPDATE titles SET color = '#4FC3F7' WHERE name ILIKE '%Order 66%';
