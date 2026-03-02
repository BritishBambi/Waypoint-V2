-- 0008_notifications.sql
-- Notification system: table + RLS + triggers for follow, review_like, review_comment events.

-- ─── Table ────────────────────────────────────────────────────────────────────

create type notification_type as enum ('follow', 'review_like', 'review_comment');

create table if not exists notifications (
  id          uuid                primary key default gen_random_uuid(),
  user_id     uuid                not null references auth.users(id) on delete cascade,
  actor_id    uuid                not null references auth.users(id) on delete cascade,
  type        notification_type   not null,
  review_id   uuid                references reviews(id) on delete cascade,
  comment_id  uuid                references review_comments(id) on delete cascade,
  read        boolean             not null default false,
  created_at  timestamptz         not null default now()
);

create index notifications_user_id_idx on notifications (user_id, created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table notifications enable row level security;

-- Users may only read their own notifications.
create policy "Users read own notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- Users may mark their own notifications as read.
create policy "Users update own notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Trigger: follow ──────────────────────────────────────────────────────────
-- Fires when someone follows another user.
-- NEW.follower_id  = person who followed (actor)
-- NEW.followee_id  = person who received the follow (recipient)

create or replace function notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip self-follow (guarded by DB constraint already, but be safe).
  if new.follower_id = new.followee_id then
    return new;
  end if;

  insert into notifications (user_id, actor_id, type)
  values (new.followee_id, new.follower_id, 'follow');

  return new;
end;
$$;

create trigger trg_notify_on_follow
  after insert on follows
  for each row execute function notify_on_follow();

-- ─── Trigger: review_like ─────────────────────────────────────────────────────
-- Fires when a review is liked.
-- Notifies the review's author, not the liker.

create or replace function notify_on_review_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_owner uuid;
begin
  select user_id into v_review_owner
  from reviews
  where id = new.review_id;

  -- Don't notify if the review owner liked their own review.
  if v_review_owner is null or v_review_owner = new.user_id then
    return new;
  end if;

  insert into notifications (user_id, actor_id, type, review_id)
  values (v_review_owner, new.user_id, 'review_like', new.review_id);

  return new;
end;
$$;

create trigger trg_notify_on_review_like
  after insert on review_likes
  for each row execute function notify_on_review_like();

-- ─── Trigger: review_comment ──────────────────────────────────────────────────
-- Fires when a comment is posted on a review.
-- Notifies the review's author (if not the commenter).
-- Does NOT fan-out to other commenters (keep it simple).

create or replace function notify_on_review_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_owner uuid;
begin
  select user_id into v_review_owner
  from reviews
  where id = new.review_id;

  if v_review_owner is null or v_review_owner = new.user_id then
    return new;
  end if;

  insert into notifications (user_id, actor_id, type, review_id, comment_id)
  values (v_review_owner, new.user_id, 'review_comment', new.review_id, new.id);

  return new;
end;
$$;

create trigger trg_notify_on_review_comment
  after insert on review_comments
  for each row execute function notify_on_review_comment();
