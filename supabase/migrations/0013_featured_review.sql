-- Add featured_review_id to profiles so users can showcase one review on their profile.
-- ON DELETE SET NULL ensures the column clears automatically if the review is deleted.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS featured_review_id uuid REFERENCES reviews(id) ON DELETE SET NULL;
