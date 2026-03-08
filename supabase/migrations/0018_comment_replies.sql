-- 0018_comment_replies.sql
-- Add reply threading to review comments:
--   • reply_to_id FK on review_comments
--   • comment_reply notification type
--   • Combined trigger: reply notification for @mentions + review_comment for owner

-- ─── reply_to_id ──────────────────────────────────────────────────────────────

alter table review_comments
  add column if not exists reply_to_id uuid
  references review_comments(id) on delete set null;

-- ─── Extend enum ──────────────────────────────────────────────────────────────

alter type notification_type add value if not exists 'comment_reply';

-- ─── Combined trigger function ────────────────────────────────────────────────
-- Replaces notify_on_review_comment:
--   1. If comment body starts with @username, notifies the mentioned user
--      as a comment_reply.
--   2. Notifies the review owner as a review_comment (unless the owner is the
--      commenter, or was already notified via the @mention above).

create or replace function notify_on_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_owner_id   uuid;
  v_mentioned_username text;
  v_mentioned_user_id  uuid;
begin
  -- 1. Parse @username mention from the start of the comment body.
  if new.body like '@%' then
    -- Extract the first word after @
    v_mentioned_username := split_part(split_part(new.body, '@', 2), ' ', 1);

    if v_mentioned_username <> '' then
      select id into v_mentioned_user_id
      from profiles
      where username = v_mentioned_username;

      if v_mentioned_user_id is not null and v_mentioned_user_id <> new.user_id then
        insert into notifications (user_id, actor_id, type, review_id, comment_id)
        values (v_mentioned_user_id, new.user_id, 'comment_reply', new.review_id, new.id);
      end if;
    end if;
  end if;

  -- 2. Notify the review owner, skipping if they are the commenter or
  --    were already notified as the @mentioned user above.
  select user_id into v_review_owner_id
  from reviews
  where id = new.review_id;

  if v_review_owner_id is not null
    and v_review_owner_id <> new.user_id
    and v_review_owner_id is distinct from v_mentioned_user_id
  then
    insert into notifications (user_id, actor_id, type, review_id, comment_id)
    values (v_review_owner_id, new.user_id, 'review_comment', new.review_id, new.id);
  end if;

  return new;
end;
$$;

-- ─── Replace old trigger ──────────────────────────────────────────────────────

drop trigger if exists trg_notify_on_review_comment on review_comments;
drop trigger if exists trg_notify_on_comment on review_comments;

create trigger trg_notify_on_comment
  after insert on review_comments
  for each row execute function notify_on_comment_reply();

notify pgrst, 'reload schema';
