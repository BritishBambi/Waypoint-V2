-- 0011_welcome_notification.sql
-- Adds a 'welcome' system notification sent when a new profile is created.
-- actor_id is made nullable to support system notifications with no actor.

-- 1. Make actor_id nullable (system notifications have no actor)
ALTER TABLE notifications ALTER COLUMN actor_id DROP NOT NULL;

-- 2. Add 'welcome' to the notification_type enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'welcome';

-- 3. Trigger function: insert a welcome notification on profile creation
CREATE OR REPLACE FUNCTION send_welcome_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, type, read)
  VALUES (NEW.id, NULL, 'welcome', false);
  RETURN NEW;
END;
$$;

-- 4. Attach trigger to profiles table
DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION send_welcome_notification();
