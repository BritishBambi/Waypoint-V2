-- 0012_welcome_notification_backfill.sql
-- Backfills a (read) welcome notification for every existing user.
-- Runs in a separate migration so the 'welcome' enum value is committed first.

INSERT INTO notifications (user_id, actor_id, type, read)
SELECT p.id, NULL, 'welcome', true
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM notifications n
  WHERE n.user_id = p.id AND n.type = 'welcome'
);
