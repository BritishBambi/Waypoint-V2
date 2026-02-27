# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Waypoint** is a Letterboxd-style social platform for gaming. Users log games, write diary entries, rate titles, and follow friends.

## Tech stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Language | TypeScript throughout |
| Web app | Next.js 14 App Router, Tailwind CSS, shadcn/ui |
| Mobile app | Expo + Expo Router, NativeWind |
| Backend | Supabase — Postgres, Auth, Realtime, Storage, Edge Functions |
| Game data | IGDB API, proxied via a Supabase Edge Function |
| Data fetching | TanStack Query (all client-side fetching) |

### Monorepo layout

```
apps/
  web/     — Next.js 14 App Router (@waypoint/web)
  mobile/  — Expo + Expo Router  (@waypoint/mobile)
packages/
  types/       — Supabase-generated TypeScript types + Row/Insert/Update helpers
  api-client/  — Supabase client, TanStack Query hooks
  ui/          — Shared UI components
supabase/
  migrations/  — SQL migrations (apply with supabase db push)
  functions/   — Edge Functions (Deno)
```

### Internal packages are consumed from source
All `packages/*` point directly to their `src/index.ts` via `exports` — no build step required. TypeScript is resolved at the consumer level.

## Current status

- Monorepo scaffold complete
- Database schema written (`supabase/migrations/0001_initial_schema.sql`)
- Supabase type generation wired up (`pnpm generate:types`)
- **Auth not yet implemented**
- **No feature pages built yet**

## Key commands

```bash
pnpm install                  # install all dependencies
pnpm dev                      # start all apps in parallel
pnpm build                    # build all apps and packages
pnpm lint                     # lint everything via Turbo
pnpm generate:types           # regenerate packages/types/src/database.ts from remote schema

supabase start                # spin up local Supabase stack (Docker required)
supabase db push              # apply pending migrations to the linked project
supabase gen types typescript --project-id $SUPABASE_PROJECT_ID

# Target a single workspace
pnpm --filter @waypoint/web dev
pnpm --filter @waypoint/mobile dev
```

## Coding conventions

- **All components are TypeScript functional components.**
- **Named exports only** — never `export default` for components.
- **Supabase types** are imported from `@waypoint/types`, using the `Tables<T>`, `Inserts<T>`, and `Updates<T>` helpers.
- **TanStack Query** for all client-side data fetching — no raw `useEffect` fetches.
- **Tailwind for all styling** — no inline styles, no CSS modules.

## Supabase

Local config: [supabase/config.toml](supabase/config.toml). Edge Functions: [supabase/functions/](supabase/functions/).

`packages/api-client` reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the environment. Copy `.env.example` → `.env.local` and fill in your values. For client-side use in Next.js or Expo, expose the vars with the appropriate platform prefix (`NEXT_PUBLIC_` / `EXPO_PUBLIC_`).

## Turbo pipeline

Defined in [turbo.json](turbo.json). `build` depends on `^build` (builds dependencies first). `dev` is persistent and uncached.
