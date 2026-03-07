-- =============================================================================
-- 0014_review_reactions.sql
-- Replaces the binary like system with per-emoji reactions.
-- Migrates existing review_likes → ❤️ reactions.
-- Adds emoji column to notifications and a new review_reaction trigger.
-- =============================================================================

-- ── Table: review_reactions ───────────────────────────────────────────────────

CREATE TABLE review_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid        NOT NULL REFERENCES reviews(id)  ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      text        NOT NULL CHECK (emoji IN ('👍', '❤️', '🤡', '😂', '🎉')),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (review_id, user_id, emoji)
);

CREATE INDEX review_reactions_review_id_idx ON review_reactions (review_id);
CREATE INDEX review_reactions_user_id_idx   ON review_reactions (user_id);

ALTER TABLE review_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_reactions: public read"
  ON review_reactions FOR SELECT USING (true);

CREATE POLICY "review_reactions: insert own"
  ON review_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "review_reactions: delete own"
  ON review_reactions FOR DELETE
  USING (user_id = auth.uid());

-- ── Migrate existing likes → ❤️ reactions ────────────────────────────────────

INSERT INTO review_reactions (review_id, user_id, emoji, created_at)
SELECT review_id, user_id, '❤️', created_at
FROM review_likes
ON CONFLICT DO NOTHING;

-- ── notifications: add emoji column ──────────────────────────────────────────
-- Stored on reaction notifications so the UI can display which emoji was used.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS emoji text;

-- ── notification_type: add review_reaction value ─────────────────────────────
-- review_like is kept in the enum for backward-compat with existing rows.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'review_reaction';

-- ── Trigger: notify_on_review_reaction ───────────────────────────────────────
-- Fires on every new row in review_reactions.
-- Bunching (grouping multiple reactions into one UI row) is handled client-side
-- by keying on (review_id, emoji).

CREATE OR REPLACE FUNCTION notify_on_review_reaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_owner uuid;
BEGIN
  SELECT user_id INTO v_review_owner
  FROM reviews
  WHERE id = NEW.review_id;

  -- No self-notifications.
  IF v_review_owner IS NULL OR v_review_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, type, review_id, emoji)
  VALUES (v_review_owner, NEW.user_id, 'review_reaction', NEW.review_id, NEW.emoji);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_review_reaction
  AFTER INSERT ON review_reactions
  FOR EACH ROW EXECUTE FUNCTION notify_on_review_reaction();
