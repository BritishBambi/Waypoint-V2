-- =============================================================================
-- 0001_initial_schema.sql
-- Initial schema for Waypoint — a social game-tracking app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Trigger function: set_updated_at
-- Applied to every table that has an updated_at column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- Table: profiles
-- One row per auth.users entry; auto-created by the handle_new_user trigger.
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text        NOT NULL UNIQUE,
  display_name text,
  bio          text,
  avatar_url   text,
  website      text,
  is_private   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_username_format
    CHECK (username ~ '^[a-z0-9_]{3,30}$')
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Table: games
-- Reference data synced from IGDB. id matches the IGDB numeric id.
-- Written by the service role only; no INSERT policy is needed for regular users.
-- ---------------------------------------------------------------------------
CREATE TABLE games (
  id             bigint      PRIMARY KEY, -- IGDB numeric id
  slug           text        NOT NULL UNIQUE,
  title          text        NOT NULL,
  cover_url      text,
  summary        text,
  genres         text[],
  platforms      text[],
  release_date   date,
  igdb_rating    numeric(4, 2),
  igdb_synced_at timestamptz
);


-- ---------------------------------------------------------------------------
-- Table: game_logs
-- One entry per (user, game). Tracks play status and dates.
-- Diary entries and a review hang off this record.
-- ---------------------------------------------------------------------------
CREATE TABLE game_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id     bigint      NOT NULL REFERENCES games(id)    ON DELETE CASCADE,
  status      text        NOT NULL,
  started_at  date,
  finished_at date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT game_logs_status_check
    CHECK (status IN ('playing', 'played', 'wishlist', 'dropped', 'shelved')),
  CONSTRAINT game_logs_user_game_unique
    UNIQUE (user_id, game_id)
);

CREATE TRIGGER set_game_logs_updated_at
  BEFORE UPDATE ON game_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Table: diary_entries
-- Multiple timestamped log entries per game_log (e.g. replays, sessions).
-- ---------------------------------------------------------------------------
CREATE TABLE diary_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id     uuid        NOT NULL REFERENCES game_logs(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  body       text        NOT NULL,
  play_date  date,
  rating     smallint,
  is_spoiler boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT diary_entries_body_length
    CHECK (char_length(body) <= 5000),
  CONSTRAINT diary_entries_rating_range
    CHECK (rating BETWEEN 1 AND 10)
);

CREATE TRIGGER set_diary_entries_updated_at
  BEFORE UPDATE ON diary_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Table: reviews
-- One review per game_log (enforced by UNIQUE on log_id).
-- A review can remain a draft (is_draft = true) until the user publishes it.
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       uuid        NOT NULL UNIQUE REFERENCES game_logs(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id      bigint      NOT NULL REFERENCES games(id)    ON DELETE CASCADE,
  body         text,
  rating       smallint    NOT NULL,
  is_spoiler   boolean     NOT NULL DEFAULT false,
  is_draft     boolean     NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reviews_rating_range
    CHECK (rating BETWEEN 1 AND 10)
);

CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Table: follows
-- Directed social graph. Composite PK prevents duplicate follow rows.
-- ---------------------------------------------------------------------------
CREATE TABLE follows (
  follower_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followee_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (follower_id, followee_id),

  CONSTRAINT no_self_follow
    CHECK (follower_id != followee_id)
);


-- ---------------------------------------------------------------------------
-- Table: lists
-- User-curated game lists (ranked or unranked, public or private).
-- ---------------------------------------------------------------------------
CREATE TABLE lists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  is_public   boolean     NOT NULL DEFAULT true,
  is_ranked   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lists_title_length
    CHECK (char_length(title) <= 100),
  CONSTRAINT lists_description_length
    CHECK (char_length(description) <= 500)
);

CREATE TRIGGER set_lists_updated_at
  BEFORE UPDATE ON lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- Table: list_entries
-- Games within a list. Position is nullable; only meaningful when is_ranked.
-- ---------------------------------------------------------------------------
CREATE TABLE list_entries (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id  uuid    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  game_id  bigint  NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  note     text,
  position integer,

  CONSTRAINT list_entries_list_game_unique
    UNIQUE (list_id, game_id),
  CONSTRAINT list_entries_note_length
    CHECK (char_length(note) <= 300)
);


-- ---------------------------------------------------------------------------
-- Indexes
-- FK columns not covered by a UNIQUE constraint get explicit indexes.
-- ---------------------------------------------------------------------------

-- game_logs
CREATE INDEX game_logs_user_id_idx ON game_logs (user_id);
CREATE INDEX game_logs_game_id_idx ON game_logs (game_id);
CREATE INDEX game_logs_status_idx  ON game_logs (status);

-- diary_entries
CREATE INDEX diary_entries_log_id_idx    ON diary_entries (log_id);
CREATE INDEX diary_entries_user_id_idx   ON diary_entries (user_id);
CREATE INDEX diary_entries_play_date_idx ON diary_entries (play_date DESC);

-- reviews
CREATE INDEX reviews_user_id_idx      ON reviews (user_id);
CREATE INDEX reviews_game_id_idx      ON reviews (game_id);
CREATE INDEX reviews_published_at_idx ON reviews (published_at DESC)
  WHERE published_at IS NOT NULL;

-- follows: follower_id is part of the PK so already indexed
CREATE INDEX follows_followee_id_idx ON follows (followee_id);

-- lists
CREATE INDEX lists_user_id_idx ON lists (user_id);

-- list_entries: list_id is covered by the unique constraint
CREATE INDEX list_entries_game_id_idx       ON list_entries (game_id);
CREATE INDEX list_entries_list_position_idx ON list_entries (list_id, position);


-- ---------------------------------------------------------------------------
-- Trigger: handle_new_user
-- Runs after a row is inserted into auth.users and creates the matching
-- profile. The username falls back to a deterministic slug derived from the
-- user's UUID so that the insert is always safe to retry.
-- SECURITY DEFINER + explicit search_path guards against search-path attacks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_entries  ENABLE ROW LEVEL SECURITY;


-- ── profiles ──────────────────────────────────────────────────────────────
-- Public profiles are visible to everyone.
-- Private profiles are only visible to the owner or approved followers.
CREATE POLICY "profiles: read public or own or followed"
  ON profiles FOR SELECT USING (
    NOT is_private
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM follows
      WHERE follower_id = auth.uid()
        AND followee_id = profiles.id
    )
  );

-- handle_new_user (SECURITY DEFINER) performs the INSERT, but this policy
-- allows the client to upsert via supabase-js after OAuth flows if needed.
CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles: delete own"
  ON profiles FOR DELETE
  USING (id = auth.uid());


-- ── games ─────────────────────────────────────────────────────────────────
-- Games are read-only reference data for authenticated and anonymous users.
-- Writes are performed by the service role (IGDB sync), which bypasses RLS.
CREATE POLICY "games: public read"
  ON games FOR SELECT USING (true);


-- ── game_logs ─────────────────────────────────────────────────────────────
-- Visibility follows the owner's profile privacy setting.
CREATE POLICY "game_logs: read own or visible profile"
  ON game_logs FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = game_logs.user_id
        AND (
          NOT p.is_private
          OR EXISTS (
            SELECT 1 FROM follows f
            WHERE f.follower_id = auth.uid()
              AND f.followee_id = p.id
          )
        )
    )
  );

CREATE POLICY "game_logs: insert own"
  ON game_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "game_logs: update own"
  ON game_logs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "game_logs: delete own"
  ON game_logs FOR DELETE
  USING (user_id = auth.uid());


-- ── diary_entries ─────────────────────────────────────────────────────────
CREATE POLICY "diary_entries: read own or visible profile"
  ON diary_entries FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = diary_entries.user_id
        AND (
          NOT p.is_private
          OR EXISTS (
            SELECT 1 FROM follows f
            WHERE f.follower_id = auth.uid()
              AND f.followee_id = p.id
          )
        )
    )
  );

-- Ensure the referenced log belongs to the same user inserting the entry.
CREATE POLICY "diary_entries: insert own"
  ON diary_entries FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM game_logs gl
      WHERE gl.id = diary_entries.log_id
        AND gl.user_id = auth.uid()
    )
  );

CREATE POLICY "diary_entries: update own"
  ON diary_entries FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "diary_entries: delete own"
  ON diary_entries FOR DELETE
  USING (user_id = auth.uid());


-- ── reviews ───────────────────────────────────────────────────────────────
-- Published non-draft reviews are public. Drafts are owner-only.
CREATE POLICY "reviews: read published or own"
  ON reviews FOR SELECT USING (
    (NOT is_draft AND published_at IS NOT NULL)
    OR user_id = auth.uid()
  );

-- Ensure the referenced log belongs to the same user inserting the review.
CREATE POLICY "reviews: insert own"
  ON reviews FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM game_logs gl
      WHERE gl.id = reviews.log_id
        AND gl.user_id = auth.uid()
    )
  );

CREATE POLICY "reviews: update own"
  ON reviews FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "reviews: delete own"
  ON reviews FOR DELETE
  USING (user_id = auth.uid());


-- ── follows ───────────────────────────────────────────────────────────────
-- Follow relationships are publicly readable (follower counts, discovery).
CREATE POLICY "follows: public read"
  ON follows FOR SELECT USING (true);

CREATE POLICY "follows: insert own"
  ON follows FOR INSERT
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "follows: delete own"
  ON follows FOR DELETE
  USING (follower_id = auth.uid());


-- ── lists ─────────────────────────────────────────────────────────────────
CREATE POLICY "lists: read public or own"
  ON lists FOR SELECT USING (
    is_public OR user_id = auth.uid()
  );

CREATE POLICY "lists: insert own"
  ON lists FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lists: update own"
  ON lists FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "lists: delete own"
  ON lists FOR DELETE
  USING (user_id = auth.uid());


-- ── list_entries ──────────────────────────────────────────────────────────
-- Visibility is derived from the parent list's is_public flag.
CREATE POLICY "list_entries: read if list is visible"
  ON list_entries FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lists l
      WHERE l.id = list_entries.list_id
        AND (l.is_public OR l.user_id = auth.uid())
    )
  );

CREATE POLICY "list_entries: insert into own list"
  ON list_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists l
      WHERE l.id = list_entries.list_id
        AND l.user_id = auth.uid()
    )
  );

CREATE POLICY "list_entries: update own list"
  ON list_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lists l
      WHERE l.id = list_entries.list_id
        AND l.user_id = auth.uid()
    )
  );

CREATE POLICY "list_entries: delete from own list"
  ON list_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM lists l
      WHERE l.id = list_entries.list_id
        AND l.user_id = auth.uid()
    )
  );
