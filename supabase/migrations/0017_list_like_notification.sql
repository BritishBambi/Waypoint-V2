-- 0017_list_like_notification.sql
-- Add list_like notification type + trigger on list_likes.

-- ─── Extend enum ──────────────────────────────────────────────────────────────

alter type notification_type add value if not exists 'list_like';

-- ─── Add list_id column ───────────────────────────────────────────────────────

alter table notifications
  add column if not exists list_id uuid references lists(id) on delete cascade;

-- ─── Delete policy (needed for clearAll / dismiss in the UI) ──────────────────

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notifications'
      and policyname = 'Users delete own notifications'
  ) then
    execute '
      create policy "Users delete own notifications"
        on notifications for delete
        using (auth.uid() = user_id)
    ';
  end if;
end$$;

-- ─── Trigger function ─────────────────────────────────────────────────────────

create or replace function notify_on_list_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list_owner uuid;
begin
  select user_id into v_list_owner
  from lists
  where id = new.list_id;

  -- Don't notify if the list owner liked their own list.
  if v_list_owner is null or v_list_owner = new.user_id then
    return new;
  end if;

  insert into notifications (user_id, actor_id, type, list_id)
  values (v_list_owner, new.user_id, 'list_like', new.list_id);

  return new;
end;
$$;

-- ─── Trigger ──────────────────────────────────────────────────────────────────

drop trigger if exists trg_notify_on_list_like on list_likes;

create trigger trg_notify_on_list_like
  after insert on list_likes
  for each row execute function notify_on_list_like();

notify pgrst, 'reload schema';
