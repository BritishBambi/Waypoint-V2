-- 0025_titles.sql
-- Curated title system: titles awarded for 100% achievement completion.
-- Titles are linked to a specific game (game_id int → games.id).

-- ─── titles table ────────────────────────────────────────────────────────────

create table if not exists titles (
  id          uuid  primary key default gen_random_uuid(),
  slug        text  not null unique,
  name        text  not null,
  description text  not null,
  game_id     int   references games(id) on delete set null,
  icon_url    text,
  created_at  timestamptz not null default now()
);

alter table titles enable row level security;

create policy "Public read titles"
  on titles for select
  using (true);

-- ─── user_titles table ───────────────────────────────────────────────────────

create table if not exists user_titles (
  user_id     uuid  not null references profiles(id) on delete cascade,
  title_id    uuid  not null references titles(id)   on delete cascade,
  awarded_at  timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table user_titles enable row level security;

create policy "Public read user_titles"
  on user_titles for select
  using (true);

create policy "Service role manages user_titles"
  on user_titles for all
  using (auth.role() = 'service_role');

-- ─── active_title_id on profiles ─────────────────────────────────────────────

alter table profiles
  add column if not exists active_title_id uuid references titles(id) on delete set null;

-- ─── Extend notification_type enum ───────────────────────────────────────────

alter type notification_type add value if not exists 'title_unlocked';

-- ─── Add title_id FK to notifications ────────────────────────────────────────

alter table notifications
  add column if not exists title_id uuid references titles(id) on delete set null;

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- game_id is left null — games.id rows only exist after a detail page visit.
-- The steam-sync function matches by steam_app_id and sets game_id at award time.
-- steam_app_id is stored in the slug convention for lookup in edge function logic.

insert into titles (slug, name, description, game_id, icon_url) values
  ('portal-2-tester',       'Test Subject',         '100% achievements in Portal 2',              null, null),
  ('hollow-knight-vessel',  'Empty Vessel',         '100% achievements in Hollow Knight',         null, null),
  ('celeste-mountain',      'Mountain Conqueror',   '100% achievements in Celeste',               null, null),
  ('hades-champion',        'Underworld Champion',  '100% achievements in Hades',                 null, null),
  ('the-witcher-3-master',  'Witcher',              '100% achievements in The Witcher 3',         null, null),
  ('elden-ring-sovereign',  'Elden Lord',           '100% achievements in Elden Ring',            null, null),
  ('dead-cells-beheaded',   'The Beheaded',         '100% achievements in Dead Cells',            null, null),
  ('sekiro-wolf',           'The One-Armed Wolf',   '100% achievements in Sekiro',                null, null),
  ('stardew-valley-farmer', 'Stardew Farmer',       '100% achievements in Stardew Valley',        null, null),
  ('cuphead-hero',          'The Devil''s Nemesis', '100% achievements in Cuphead',               null, null)
on conflict (slug) do nothing;
