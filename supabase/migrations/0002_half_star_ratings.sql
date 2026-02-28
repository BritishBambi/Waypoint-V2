-- Migration 0002: support half-star ratings (0.5–5.0)
--
-- diary_entries.rating and reviews.rating were smallint (1–10).
-- Change to numeric(3,1) and update CHECK constraints to accept 0.5–5.0,
-- matching the new 5-star / half-star UI.

ALTER TABLE diary_entries
  DROP CONSTRAINT diary_entries_rating_range,
  ALTER COLUMN rating TYPE numeric(3, 1),
  ADD CONSTRAINT diary_entries_rating_range
    CHECK (rating BETWEEN 0.5 AND 5.0);

ALTER TABLE reviews
  DROP CONSTRAINT reviews_rating_range,
  ALTER COLUMN rating TYPE numeric(3, 1),
  ADD CONSTRAINT reviews_rating_range
    CHECK (rating BETWEEN 0.5 AND 5.0);
