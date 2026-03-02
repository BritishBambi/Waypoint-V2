-- =============================================================================
-- 0003_review_social.sql
-- Adds social features for reviews: likes and comments.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Table: review_likes
-- One row per (user, review). The UNIQUE constraint enforces one like per user.
-- ---------------------------------------------------------------------------
CREATE TABLE review_likes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid        NOT NULL REFERENCES reviews(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (review_id, user_id)
);

CREATE INDEX review_likes_review_id_idx ON review_likes (review_id);
CREATE INDEX review_likes_user_id_idx   ON review_likes (user_id);

ALTER TABLE review_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_likes: public read"
  ON review_likes FOR SELECT USING (true);

CREATE POLICY "review_likes: insert own"
  ON review_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "review_likes: delete own"
  ON review_likes FOR DELETE
  USING (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Table: review_comments
-- Comments on published reviews. Body capped at 500 characters.
-- ---------------------------------------------------------------------------
CREATE TABLE review_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid        NOT NULL REFERENCES reviews(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT review_comments_body_length CHECK (char_length(body) <= 500)
);

CREATE INDEX review_comments_review_id_idx ON review_comments (review_id);
CREATE INDEX review_comments_user_id_idx   ON review_comments (user_id);

ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_comments: public read"
  ON review_comments FOR SELECT USING (true);

CREATE POLICY "review_comments: insert own"
  ON review_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "review_comments: delete own"
  ON review_comments FOR DELETE
  USING (user_id = auth.uid());
