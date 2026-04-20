# Waypoint

Waypoint is a social gaming platform inspired by Letterboxd. Users can log games, write reviews, rate titles, track playtime via Steam, follow friends, build curated lists, and discover new games through their community.

[View Live Site](https://waypoint-v2-web.vercel.app) | [Original Django Version](https://github.com/BritishBambi/The-Waypoint-PP4)

---

## Table of Contents

- [Project Overview](#project-overview)
- [UX](#ux)
  - [Strategy](#strategy)
  - [User Stories](#user-stories)
  - [Wireframes](#wireframes)
  - [Surface](#surface)
  - [Database Schema](#database-schema)
- [Features](#features)
  - [Homepage](#homepage)
  - [Game Detail Page](#game-detail-page)
  - [Steam Integration](#steam-integration)
  - [Library](#library)
  - [Wishlist](#wishlist)
  - [Activity Feed](#activity-feed)
  - [User Profiles](#user-profiles)
  - [Stats Page](#stats-page)
  - [Lists](#lists)
  - [Reviews and Reactions](#reviews-and-reactions)
  - [Title System](#title-system)
  - [Notifications](#notifications)
  - [Search](#search)
- [Future Features](#future-features)
- [Technologies Used](#technologies-used)
- [Deployment](#deployment)
- [Cloning and Forking](#cloning-and-forking)
- [Testing](#testing)
- [Bugs](#bugs)
- [Credits and Acknowledgements](#credits-and-acknowledgements)

---

## Project Overview

Waypoint started as a Code Institute portfolio project: a Django-based gaming log site. This version is a ground-up rebuild using a modern full-stack architecture. The goal was to build a platform that functions as a genuine social layer for gamers, not another review aggregator.

The current version is a live, deployed web application with real users, Steam integration that automatically syncs gaming libraries, and an expanding feature set.

---

## UX

### Strategy

#### The Problem

Letterboxd exists for film fans: a beautiful, social, opinionated platform where taste matters. Nothing comparable exists for games. Goodreads exists for book readers. Gamers have spreadsheets and Discord servers.

Waypoint is the answer to that gap.

#### Ideal User

- Someone with a large gaming library who wants to track what they have played
- A gamer who wants to share opinions and read reviews from real people, not critics
- Someone who wants to follow friends and see what they are playing right now
- A completionist who wants to track 100% achievement runs and display them
- Anyone who wants to maintain a meaningful record of the games they have played

#### Goals

- Make logging a game as frictionless as possible
- Surface social activity naturally, since what your friends are playing matters
- Reward dedicated players through the title system
- Build a platform that feels like it was made by a gamer, for gamers

---

### User Stories

#### Authentication Epic

- **User Story: Register** - As a user, I want to create an account so that I can log games and interact with the community.
  - *Acceptance Criteria*: Email and password registration works. User is redirected to their new profile on first login. A welcome notification is created automatically.

- **User Story: Login/Logout** - As a user, I want to log in and out securely so that my data is protected.
  - *Acceptance Criteria*: Login with email and password works. Discord OAuth login works. Logging out clears session state fully.

#### Game Discovery Epic

- **User Story: Search Games** - As a user, I want to search for any game so that I can find it quickly and log it.
  - *Acceptance Criteria*: Search returns real results from the IGDB database. Results are sorted by relevance. Clicking a result takes me to the game detail page.

- **User Story: Browse Popular Games** - As a user, I want to see what games are popular right now so that I can discover new titles.
  - *Acceptance Criteria*: Homepage shows a carousel of trending games. Upcoming games are also surfaced with release dates.

- **User Story: View Game Detail** - As a user, I want to view detailed information about any game so that I know what I am logging.
  - *Acceptance Criteria*: Game page shows cover art, description, release date, genres, platforms. Cinematic backdrop image pulled from game artwork or screenshots.

#### Logging Epic

- **User Story: Log a Game** - As a user, I want to log a game with a status so that I can track my library.
  - *Acceptance Criteria*: Log modal allows me to set status (Playing, Completed, Backlog, Wishlist, Dropped). Status can be changed or removed at any time.

- **User Story: Rate a Game** - As a user, I want to rate a game out of 10 so that I can record my score.
  - *Acceptance Criteria*: Rating field appears in log modal for Playing and Completed statuses. Rating shows on library cards and game pages.

- **User Story: Write a Review** - As a user, I want to write a review so that I can share my thoughts publicly.
  - *Acceptance Criteria*: Review text box available from the log modal or game detail page. Reviews appear on game pages and in friend activity. Spoiler toggle available.

- **User Story: Add Private Notes** - As a user, I want to add private notes to a game so that I can keep personal reminders about it.
  - *Acceptance Criteria*: Notes field available in log modal for all statuses except Wishlist. Notes are never visible to other users. Notes appear on my game detail view and library cards.

#### Social Epic

- **User Story: Follow Users** - As a user, I want to follow other users so that I can see their activity.
  - *Acceptance Criteria*: Follow button on all profiles. Following/follower counts shown. Can unfollow at any time.

- **User Story: Activity Feed** - As a user, I want to see what my friends are playing so that I can stay connected.
  - *Acceptance Criteria*: Homepage feed shows recent activity from followed users (Playing, Completed, Dropped only). Full activity page available.

- **User Story: Who to Follow** - As a user, I want to get suggestions for who to follow so that I can find people with similar taste.
  - *Acceptance Criteria*: Homepage widget shows taste-matched users first (shared games), popular users as fallback.

#### Steam Integration Epic

- **User Story: Connect Steam** - As a user, I want to connect my Steam account so that I can sync my library automatically.
  - *Acceptance Criteria*: Steam OpenID connection from edit profile page. My Steam display name and avatar stored. Disconnect option available.

- **User Story: Sync Steam Library** - As a user, I want to sync my Steam library so that my playtime and achievements are tracked.
  - *Acceptance Criteria*: Sync button on edit profile page. Playtime populated for all owned games. Achievement counts updated. New games added to Waypoint's database automatically.

- **User Story: View Achievements** - As a user, I want to see my Steam achievements on each game's page so that I can track my progress.
  - *Acceptance Criteria*: Achievement icon row shown on game detail page. Clicking opens full modal sorted by rarity. Locked achievements shown in greyscale.

#### Title System Epic

- **User Story: Earn a Title** - As a user, I want to earn a title when I 100% a game so that my dedication is recognised.
  - *Acceptance Criteria*: Title automatically awarded when Steam sync detects 100% achievements. Toast notification fires immediately. Persistent notification created.

- **User Story: Equip a Title** - As a user, I want to choose which title displays on my profile so that I can show off the one I am proudest of.
  - *Acceptance Criteria*: Dropdown on edit profile page shows all earned titles. Selected title appears below my username on my profile.

#### Lists Epic

- **User Story: Create a List** - As a user, I want to create a curated game list so that I can group and share games I care about.
  - *Acceptance Criteria*: Create list page with title, description, ranked/unranked toggle. Games can be added, reordered, and removed.

- **User Story: Like a List** - As a user, I want to like other users' lists so that I can show appreciation.
  - *Acceptance Criteria*: Like button on all public lists. Like count visible. Liked lists discoverable.

#### Profile Epic

- **User Story: View Profile** - As a user, I want to view my profile so that I can see how it appears to others.
  - *Acceptance Criteria*: Profile shows avatar, display name, active title, favourite games, showcase, library preview, and stats bar.

- **User Story: Edit Profile** - As a user, I want to edit my profile so that I can keep it up to date.
  - *Acceptance Criteria*: Edit profile page for display name, bio, avatar, favourite games, showcase mode, and Steam connection.

- **User Story: View Stats** - As a user, I want to see statistics about my gaming so that I can understand my habits.
  - *Acceptance Criteria*: Stats page shows genre breakdown donut chart, most played genre, highest rated genre, and games by decade.

---

### Wireframes

> *Wireframes were produced during the planning phase of the project to establish the layout and flow before development began.*

**Homepage (Logged In)**

The logged-in homepage centres around the user's social network. A welcome banner greets the user and surfaces their currently playing game. Below that, friend activity, popular games, upcoming titles, suggested users, and community lists fill the page in a flowing layout.

**Game Detail Page**

The game detail page is cinematic: a full-width backdrop image drawn from the game's screenshots or artwork fades into the page content below. Cover art sits left, all game info right. The log modal is always one click away.

**User Profile**

Profiles are built around the library. Favourite games are displayed prominently, a showcase section holds a pinned review or lists, and a library carousel sits below. Stats are accessible from a prominent link.

**Library Page**

Full grid view of the user's logged games with status filter tabs at the top. Each card shows cover art, rating, review indicator, and note indicator where relevant.

---

### Surface

#### Colour Palette

Waypoint uses a dark-first design language: deep backgrounds (near-black), muted surface layers, and a brand purple accent (`#7c3aed`) tying the UI together. Status colours and title colours are the exception, using intentionally vivid hues to draw the eye and reward discovery.

#### Typography

Clean, modern sans-serif throughout. Hierarchy is established through weight and size rather than decorative fonts, keeping the focus on game cover art and user content.

#### Design Principles

- **Cinematic**: Game art is the hero. Every game detail page feels like an event.
- **Social-first**: Friend activity, reactions, and comments are never more than one scroll away.
- **Dense but breathable**: Pack in the information, but give it space to land.

---

### Database Schema

Waypoint uses Supabase (PostgreSQL) with Row Level Security enabled on all tables. The schema covers the full feature set.

**Core tables:**

| Table | Purpose |
|---|---|
| `profiles` | Extends Supabase auth users. Stores display name, bio, avatar, Steam connection fields, active title |
| `games` | Games upserted from IGDB. Includes steam_app_id and icon_hash for Steam integration |
| `game_logs` | One row per user+game. Stores status, notes |
| `reviews` | Linked to game_logs. Stores rating, body text, spoiler flag |
| `review_reactions` | Emoji reactions on reviews (👍❤️🔥🤡😂🎉) |
| `review_comments` | Comments on reviews with reply threading |
| `follows` | Follower/followee relationships |
| `favourite_games` | Up to 5 pinned games per user |
| `lists` | User curated game lists |
| `list_entries` | Games within lists, with position and note |
| `list_likes` | Likes on lists |
| `notifications` | System and social notifications |
| `user_steam_data` | Per-user Steam playtime and achievement counts per game |
| `user_steam_achievements` | Full individual achievement data per user per game |
| `titles` | Curated titles (manually managed) linked to games |
| `user_titles` | Titles awarded to users on 100% completion |

---

## Features

### Homepage

The logged-in homepage is the social hub of Waypoint, designed to answer the most important question a gamer has when they open the app: *what are my friends playing?*

**Welcome Banner**

The top of the page greets the user by name, links to their profile, shows their game count and following count, and surfaces their currently playing game at a glance.

**New From Friends**

A live grid of recent activity from followed users. Shows Playing, Completed, and Dropped entries only, keeping the feed meaningful and excluding Wishlist and Backlog.

**Popular Right Now**

A horizontal carousel of trending games sourced from IGDB's popularity data.

**Coming Soon**

Upcoming games with release date badges so users can track what is around the corner.

**Who to Follow**

Three user suggestions powered by taste-matching. Users who share the most games in common appear first. Popular users fill any remaining slots. The follow button fades the card out on click.

**Recent and Trending Lists**

Side by side: the two most recently created public lists, and the two lists that have earned the most likes in the past seven days. This gives list creators a meaningful reason to make good content.

---

### Game Detail Page

Every game gets a cinematic page. A backdrop image, drawn from the game's screenshots or artwork, stretches across the top and fades into the dark background. Cover art anchors the left column. Game information fills the right.

From any game detail page, logged-in users can:

- Log the game with a status, rating, review, and private notes in a single modal
- See their Steam playtime and achievement progress if Steam is connected
- View and interact with achievement icons (click to open the full achievement modal)
- See the 100% completion badge if they have cleared every achievement
- Read reviews from other users with spoiler blur protection
- React to reviews with emoji reactions
- Comment on reviews and reply to existing comments

#### Achievement Modal

For users with Steam connected, the achievement section sits below the progress bar on game detail pages. A scrollable row of achievement icons, colour for unlocked and greyscale for locked, gives an instant visual summary. Clicking anywhere on the section opens the full achievement modal.

The modal lists every achievement sorted by global rarity (most common first), showing the icon, name, description, unlock date, and the percentage of all players who have earned it.

#### 100% Completion Badge

A gold trophy badge appears below the cover art for any game where the logged-in user has achieved 100% Steam achievements. A hover tooltip confirms "100% Achievements Unlocked".

---

### Steam Integration

Steam integration is one of Waypoint's flagship features. Connect your Steam account once and the platform handles everything else.

#### Connecting Steam

From the edit profile page, click **Connect Steam**. You will be redirected to Steam's OpenID login, then returned to Waypoint with your Steam profile linked. Your Steam avatar and display name are stored and visible on your Waypoint profile via a badge with a direct link to your Steam page.

#### Syncing Your Library

The **Sync Steam** button runs a full library sync in the background:

1. Your Steam library is fetched (including all owned games, playtime, and app info)
2. Any games not yet in Waypoint's database are automatically discovered via IGDB and added
3. Playtime and achievement counts are updated for every matched game
4. Full individual achievement data (icons, descriptions, unlock times, global rarity) is stored
5. Any games you have 100% completed that have a Waypoint title attached are automatically awarded

The first sync is the most significant: it populates Waypoint's game database from your library, meaning every game you own becomes part of the platform for all users.

---

### Library

The library page is a complete grid view of everything a user has logged: Playing, Completed, Backlog, and Dropped. Wishlist lives separately.

**Status Tabs**

Tabs across the top filter the grid: All, Playing, Completed, Dropped, Backlog. Each tab shows the count for that status. Filtering is instant and client-side with no page reload.

**Library Cards**

Each card shows:
- Cover art
- Rating overlay (bottom right) if rated
- Review bubble (bottom left) if reviewed, clicking jumps to the review
- Note indicator (bottom left) if a private note exists and no review is present, with a hover preview
- Status badge below the card

---

### Wishlist

A dedicated page for games the user wants to play but does not own yet, displayed as a cover grid. Unreleased games show a release date badge. Wishlist entries never appear in the activity feed.

---

### Activity Feed

The full activity feed at `/activity` shows all recent Playing, Completed, and Dropped entries from followed users, paginated at 30 per page. Clicking any entry goes to the game detail page. Backlog and Wishlist entries are intentionally excluded to keep the signal strong.

---

### User Profiles

Profiles are public by default and designed to tell the story of a gamer at a glance.

**Profile Header**

Avatar, display name, active title (with game icon and coloured text), bio, follow button, and a stats bar showing games logged, reviews written, lists created, and followers.

**Favourite Games**

Five slots for the user's most loved games, displayed as a row of cover art. Clicking takes visitors to each game's page.

**Showcase**

A featured section that can display either a pinned review (with cover art, rating, and excerpt) or two curated lists side by side. Profile owners choose their showcase mode from the edit profile page.

**Library and Wishlist Carousels**

Scrollable previews of the user's library and wishlist, with links to the full pages.

**Lists and Reviews**

All public lists and reviews shown below, with like counts and ratings visible.

---

### Stats Page

A dedicated stats page at `/user/[username]/stats` gives a visual breakdown of the user's gaming history.

**Genre Donut Chart**

Top 5 genres by game count, plus an "Other" slice for everything else. Built with Recharts using graduated purple shades. Total game count displayed in the centre.

**Most Played Genre / Highest Rated Genre**

Two stat cards sit alongside the chart showing the user's most logged genre and their highest average-rated genre (minimum 3 rated games to qualify).

**Games By Decade**

A vertical timeline of games logged by decade, newest first. Each row shows the decade, game count, and up to 10 cover thumbnails linking to individual game pages.

Stats are public and visible to all visitors.

---

### Lists

Users can create ranked or unranked curated lists of games. Lists have a title, description, and can be set to public or private.

**Ranked Lists**

Games are numbered and can be dragged to reorder. Position is displayed prominently on each entry.

**Unranked Lists**

A clean grid of game covers with optional notes per entry.

Lists can be liked by other users and appear in the **Trending Lists** section on the homepage when they pick up engagement.

---

### Reviews and Reactions

Reviews live on game detail pages and a user's profile. Each review has a 1-10 rating and an optional written body. Spoiler protection is available: spoiler reviews are blurred until the reader clicks to reveal, unless they have already played the game themselves.

**Emoji Reactions**

Six emoji reactions replace traditional likes: 👍 ❤️ 🔥 🤡 😂 🎉. Users can react with one of each per review. Reaction counts appear as pills on review cards.

**Comments**

Reviews support threaded comments. Replies are triggered by mentioning a user with `@username`. The mentioned user receives a notification. Comment authors can delete their own comments.

---

### Title System

The title system rewards genuine achievement: specifically, 100% Steam achievement completion on selected games. Titles are not earned by spending time on the platform. They are earned by completing a game to its fullest.

**How it works**

When a Steam sync detects 100% achievement completion on a game with a Waypoint title attached, the title is automatically awarded. The user receives a toast notification immediately and a persistent notification in their notification centre.

**Equipped Title Display**

Users can choose which of their earned titles to display from a dropdown on the edit profile page. The active title appears below the username on the profile page as a circular game icon followed by the title name in the game's signature colour.

In activity feeds and comments, the game icon appears as a small badge next to the username. Hovering reveals the full title name.

**Current Titles**

| Title | Game | Colour |
|---|---|---|
| Legend of Night City | Cyberpunk 2077 | Gold |
| Tarnished | Elden Ring | Warm Gold |
| Elden Lord | Elden Ring | Warm Gold |
| Order 66 Survivor | Star Wars Jedi: Fallen Order | Lightsaber Blue |
| Underworld Champion | Hades | Blood Red |
| Test Subject | Portal 2 | Orange |
| Empty Vessel | Hollow Knight | White |
| Mountain Conqueror | Celeste | Pink |
| Stardew Farmer | Stardew Valley | Earthy Green |
| The Beheaded | Dead Cells | Dark Red |
| The One-Armed Wolf | Sekiro: Shadows Die Twice | Red |
| Witcher | The Witcher 3: Wild Hunt | Silver |
| Porter | Death Stranding: Director's Cut | Electric Blue |

New titles are added manually as the platform grows.

---

### Notifications

A notification bell in the navigation bar shows unread counts in real time via Supabase Realtime.

Notification types:
- **Follow:** someone followed you
- **Review Like:** someone reacted to your review
- **Review Comment:** someone commented on your review
- **Comment Reply:** someone replied to your comment or mentioned you
- **List Like:** someone liked your list
- **Title Unlocked:** you have earned a new title, showing the game cover and title name in its signature colour
- **Welcome:** the first notification every new user receives

---

### Search

The search page serves two purposes.

**Game Search**

A debounced search bar queries IGDB in real time. Results are sorted by relevance: exact matches first, then alphabetical prefix matches, then by popularity. Clicking a result goes to the game detail page.

**People Directory**

All users on the platform listed below the game search, ranked by likes received then follower count.

---

## Future Features

### Custom Badge Artwork

The current title icons use circular-cropped Steam app icons. The plan is to commission custom badge artwork from [Julie Ucha](https://www.julieucha.com) for each title, creating unique illustrated badges that make earning a title feel like a real moment.

### PS5 / Xbox Integration

Steam is the first platform integration but not the last. PSN and Xbox Live connections are on the roadmap to bring achievement and playtime syncing to console players.

### Platform Breakdown on Stats Page

The stats page will gain a platform breakdown section showing how many games are on PC, PlayStation, Xbox, Nintendo Switch, and other platforms.

### Title Management UI

Currently titles are added and managed via SQL. A lightweight admin UI for managing the title catalogue is planned so new titles can be added without touching the database directly.

### Mobile App

A React Native / Expo mobile app is in the roadmap. The monorepo already has the `apps/mobile` workspace scaffolded. The core logged-in experience (activity feed, quick logging, notifications) is the priority for the first mobile release.

### Browse Page

A dedicated browse page for discovering games by genre, decade, platform, or popularity, going beyond the homepage carousels.

---

## Technologies Used

### Frontend

- **Next.js 14** (App Router): React framework with Server Components and Route Handlers
- **TypeScript**: end-to-end type safety
- **Tailwind CSS**: utility-first styling
- **shadcn/ui**: accessible component primitives
- **Recharts**: genre breakdown donut chart on stats page
- **TanStack Query**: client-side data fetching and caching

### Backend

- **Supabase**: Postgres database, Auth, Realtime, Storage, and Edge Functions
- **Deno**: runtime for Supabase Edge Functions
- **PostgreSQL**: with Row Level Security on all tables

### APIs

- **IGDB API**: game data, cover art, screenshots, external game IDs
- **Steam Web API**: library sync, playtime, achievements, player stats
- **Steam Store API**: AppID validation to prevent false positives

### Infrastructure

- **Turborepo**: monorepo build system with pnpm workspaces
- **Vercel**: web app deployment with automatic preview deployments on PR
- **GitHub**: version control and CI/CD

### Developer Tools

- **VS Code**: primary editor
- **pnpm**: package manager

---

## Deployment

### Live Deployment (Vercel + Supabase)

Waypoint is deployed on Vercel with Supabase as the backend.

#### Environment Variables

The following environment variables are required in Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
STEAM_API_KEY=
STEAM_CALLBACK_URL=https://your-domain.vercel.app/auth/steam/callback
```

The following secrets are required in Supabase Edge Functions:

```
STEAM_API_KEY=
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
```

#### Deploying the Web App

1. Fork or clone the repository
2. Connect the repo to a new Vercel project
3. Add all required environment variables in the Vercel dashboard
4. Deploy. Vercel will handle the build automatically.

#### Deploying Edge Functions

```bash
pnpm supabase functions deploy igdb-search --project-ref YOUR_PROJECT_REF
pnpm supabase functions deploy igdb-game-detail --project-ref YOUR_PROJECT_REF
pnpm supabase functions deploy steam-sync --project-ref YOUR_PROJECT_REF
```

> **Important**: After every deployment of `steam-sync`, go to Supabase Dashboard > Edge Functions > steam-sync > Details and turn **OFF** "Verify JWT with legacy secret". Supabase resets this to ON on every deploy, which will cause all sync requests to fail with a 401.

#### Applying Database Migrations

```bash
pnpm db:push
pnpm generate:types
```

---

## Cloning and Forking

### Clone

Creating a clone lets you run the project locally:

1. Navigate to this repository on GitHub
2. Click the green **Code** button and copy the HTTPS URL
3. In your terminal, run:
   ```bash
   git clone https://github.com/YOUR_USERNAME/waypoint-v2.git
   cd waypoint-v2
   pnpm install
   ```
4. Copy `.env.example` to `apps/web/.env.local` and fill in your environment variables
5. Run `pnpm dev` to start the development server

### Fork

1. Log in to GitHub and navigate to this repository
2. Click **Fork** in the top right corner
3. A copy of the repository will appear under your account
4. Clone your fork and follow the steps above to run it locally

---

## Testing

Testing was carried out manually across the full feature set, with particular attention to authentication flows, Steam sync edge cases, and RLS policy enforcement.

Key areas tested:

- **Authentication:** email/password registration and login, Discord OAuth, Steam OpenID connection and disconnection
- **Game logging:** all status transitions, rating, review, notes for each status type
- **Steam sync:** library discovery, playtime and achievement population, title awards, duplicate AppID handling, large library batching
- **RLS policies:** confirmed that private notes, draft reviews, and user-specific data cannot be accessed by other users
- **Activity feed:** confirmed Wishlist and Backlog entries do not appear
- **Titles:** confirmed automatic award on 100% completion, notification creation, and display across profile, feeds, and comments
- **Notifications:** all notification types confirmed working including real-time bell updates

---

## Bugs

### Resolved

**Steam AppID false positives:** During IGDB reverse lookup, EA Origin AppIDs and other platform IDs were being incorrectly stored as Steam AppIDs. Fixed by validating every candidate AppID against the Steam Store API before storing. Only valid Steam games with `success: true` and `type: "game"` are accepted.

**Supabase .in() query truncation:** Large Steam libraries (900+ games) caused silent data loss when passed as a single `.in()` query. Fixed by batching all `.in()` queries in groups of 200.

**Verify JWT with legacy secret reset:** Supabase resets the "Verify JWT with legacy secret" setting to ON after every Edge Function deployment. This caused all steam-sync requests to fail with 401. Documented as a known deployment step that must be manually turned OFF after every deploy.

**Tooltip overflow in scroll containers:** Note preview tooltips inside horizontal scroll carousels were clipped regardless of z-index values. Root cause: `overflow-x: auto` forces `overflow-y: auto` per the CSS specification, making overflow-based tooltip display impossible. Fixed by using React portals (`createPortal`) to render tooltips at the document body level with fixed positioning.

**Cover URL format inconsistency:** IGDB returns different image size identifiers (`t_720p`, `t_thumb`) depending on query context. `t_720p` is a landscape format that crops poorly into circular icons. Fixed by normalising all cover URLs to `t_cover_big` on storage and at display time.

### Known Issues

- **Notes save issue:** One user reported notes not saving on backlog entries. The notes field is correctly shown for backlog status in code. Suspected cause is a stale session token, pending confirmation after a fresh login test.
- **Celeste AppID:** Steam AppID 504230 was incorrectly assigned to the wrong game during an early discovery run. Needs manual correction in the database.

---

## Credits and Acknowledgements

### APIs and Services

- [IGDB](https://www.igdb.com): The game database powering game data, cover art, screenshots, and release information via Twitch's API.
- [Steam Web API](https://developer.valvesoftware.com/wiki/Steam_Web_API): Library sync, playtime data, achievement stats and game schema.
- [Supabase](https://supabase.com): Backend infrastructure including Postgres, Auth, Realtime, and Edge Functions.
- [Vercel](https://vercel.com): Hosting and deployment.

### Design Inspiration

- [Letterboxd](https://letterboxd.com): The gold standard for social film logging and the spiritual blueprint for what Waypoint aims to be for games.
- [RAWG.io](https://rawg.io): Early inspiration for game data presentation.

### Artwork

- Badge and logo artwork: [Julie Ucha](https://www.julieucha.com) *(custom title badge artwork planned)*

### Previous Version

The original Waypoint was built as a Code Institute Portfolio Project 4 using Django. That project proved the concept and led to this full rebuild. You can view it [here](https://github.com/BritishBambi/The-Waypoint-PP4).

---

*Built by Josef Jakubiak*
