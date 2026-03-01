-- =============================================================================
-- 0002_avatars_bucket.sql
-- Creates the 'avatars' Storage bucket and its RLS policies.
-- Avatars are stored at [user_id]/avatar.[ext] and served publicly.
-- =============================================================================

-- Create bucket (no-op if it already exists).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ── Storage RLS policies ─────────────────────────────────────────────────────
-- storage.objects has RLS enabled by default in Supabase.

-- Public read: anyone can view avatars (bucket is public, but policy still needed).
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder only.
-- Path format: [user_id]/avatar.[ext]  →  foldername[1] = user_id
CREATE POLICY "avatars: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow replacing an existing avatar (upsert from the client uses UPDATE).
CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow deleting own avatar.
CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
