-- 0009_list_likes.sql
-- list_likes table: users can heart/like a public list.

create table if not exists list_likes (
  id         uuid        primary key default gen_random_uuid(),
  list_id    uuid        not null references lists(id) on delete cascade,
  user_id    uuid        not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (list_id, user_id)
);

create index list_likes_list_id_idx on list_likes (list_id);
create index list_likes_user_id_idx on list_likes (user_id);

alter table list_likes enable row level security;

-- Anyone (including logged-out visitors) can read likes (for counts).
create policy "Public read list likes"
  on list_likes for select
  using (true);

-- Authenticated users can like lists.
create policy "Auth users insert list likes"
  on list_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can remove their own like.
create policy "Users delete own list likes"
  on list_likes for delete
  using (auth.uid() = user_id);
