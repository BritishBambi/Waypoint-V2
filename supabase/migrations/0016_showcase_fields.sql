-- Add showcase_type and list showcase columns to profiles.
-- showcase_type controls which showcase is rendered on the profile page.
-- Existing featured_review_id stays for the 'review' mode.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS showcase_type text
    CHECK (showcase_type IN ('review', 'list'))
    DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS showcase_list_1_id uuid
    REFERENCES lists(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS showcase_list_2_id uuid
    REFERENCES lists(id) ON DELETE SET NULL;

-- Notify PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
