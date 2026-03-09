// apps/web/app/page.tsx
// Homepage — two completely different layouts based on auth state.
//
// Logged-out: cinematic hero (full-bleed IGDB artwork backdrop) + features + trending + CTA
// Logged-in:  welcome bar + popular games + Letterboxd-style friend activity grid + library

import { type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { PopularCarousel } from "./PopularCarousel";
import { UpcomingCarousel } from "./UpcomingCarousel";
import { WelcomeToast } from "@/components/WelcomeToast";
import { WhoToFollowWidget, type SuggestedUser } from "./WhoToFollowWidget";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GameStub = {
  id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  igdb_rating?: number | null;
};

// game_logs joined with games (many-to-one), profiles (many-to-one), and
// reviews (one-to-one via UNIQUE FK on reviews.log_id → game_logs.id).
// PostgREST 14+ returns one-to-one embeds as a single object (or null),
// NOT as an array — so reviews is { rating: number | null } | null.
type FeedItem = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  games: GameStub | null;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  reviews: { rating: number | null } | null;
};

type OwnLog = {
  id: string;
  status: string;
  games: GameStub | null;
};

export type UpcomingGame = {
  id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  release_date_unix: number | null;
  hypes: number | null;
};

type RecentListItem = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  list_entries: Array<{ position: number | null; games: { cover_url: string | null } | null }>;
  list_likes: Array<{ id: string }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600",
];

// Curated games for the logged-out hero background rotation.
// Slugs are verified against IGDB. Artwork-first, screenshot fallback.
const HERO_GAME_SLUGS = [
  "halo-3",
  "death-stranding-2-on-the-beach",
  "cyberpunk-2077",
  "it-takes-two",
  "hades--1",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Home({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Logged-in state ───────────────────────────────────────────────────────

  if (user) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Phase 1: profile, follows, recent public lists, IGDB popular games, and upcoming games (all parallel).
    // igdb-popular is tried first; Waypoint game_logs is used only as a fallback.
    const [profileRes, followRes, recentListsRes, igdbPopularGames, igdbUpcomingGames, gamesCountRes, currentlyPlayingRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .single(),

      supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id),

      // 6 most-recent public lists with at least one game.
      supabase
        .from("lists")
        .select(`
          id, title, description, created_at,
          profiles!lists_user_id_fkey(username, display_name, avatar_url),
          list_entries(position, games(cover_url)),
          list_likes(id)
        `)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(20),

      // IGDB global popularity — most followed base games with ≥500 ratings.
      fetch(`${supabaseUrl}/functions/v1/igdb-popular`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const data = await res.json();
          return (data.results as GameStub[]) ?? null;
        })
        .catch(() => null),

      // IGDB upcoming games — releases in the next 6 months sorted by hype.
      fetch(`${supabaseUrl}/functions/v1/igdb-upcoming`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const data = await res.json();
          return (data.results as UpcomingGame[]) ?? null;
        })
        .catch(() => null),

      // Total games logged across all active statuses.
      supabase
        .from("game_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["playing", "played", "dropped", "backlog"]),

      // Most-recently updated game currently being played.
      supabase
        .from("game_logs")
        .select("updated_at, games(slug, title, cover_url)")
        .eq("user_id", user.id)
        .eq("status", "playing")
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

    const profile     = profileRes.data as { username: string; display_name: string | null; avatar_url: string | null } | null;
    const followRows  = followRes.data as Array<{ followee_id: string }> | null;
    const followedIds = (followRows ?? []).map((r) => r.followee_id);
    const upcomingGames: UpcomingGame[] = igdbUpcomingGames ?? [];
    const gamesLoggedCount = gamesCountRes.count ?? 0;
    type CurrentlyPlayingRow = { games: { slug: string; title: string; cover_url: string | null } | null };
    const currentlyPlayingRows = (currentlyPlayingRes.data ?? []) as unknown as CurrentlyPlayingRow[];
    const currentlyPlaying = currentlyPlayingRows[0]?.games ?? null;

    // ── Who to Follow (runs in parallel with Phase 2 feed below) ─────────────
    // Closure captures supabase, user, followedIds — all resolved from Phase 1.
    async function buildSuggestions(): Promise<SuggestedUser[]> {
      try {
        const alreadyFollowedSet = new Set(followedIds);

        // Step 1 — taste-matched users (≥2 shared logged games).
        let tasteCandidates: { userId: string; sharedGames: number }[] = [];

        const { data: myLogsRaw } = await supabase
          .from("game_logs")
          .select("game_id")
          .eq("user_id", user!.id)
          .in("status", ["playing", "played", "dropped", "backlog"])
          .limit(200);
        const myGameIds = (myLogsRaw ?? []).map((r) => (r as any).game_id as number).filter(Boolean);

        if (myGameIds.length > 0) {
          const { data: sharedRaw } = await supabase
            .from("game_logs")
            .select("user_id, game_id")
            .in("game_id", myGameIds)
            .in("status", ["playing", "played", "dropped", "backlog"])
            .neq("user_id", user!.id)
            .limit(2000);
          const sharedLogs = (sharedRaw ?? []) as { user_id: string; game_id: number }[];

          const sharedByUser = new Map<string, Set<number>>();
          for (const log of sharedLogs) {
            if (alreadyFollowedSet.has(log.user_id)) continue;
            const s = sharedByUser.get(log.user_id) ?? new Set();
            s.add(log.game_id);
            sharedByUser.set(log.user_id, s);
          }
          tasteCandidates = [...sharedByUser.entries()]
            .filter(([, games]) => games.size >= 2)
            .sort((a, b) => b[1].size - a[1].size)
            .slice(0, 3)
            .map(([userId, games]) => ({ userId, sharedGames: games.size }));
        }

        // Step 2 — fill remaining slots with most-followed users not yet followed.
        const remaining = 3 - tasteCandidates.length;
        let popularCandidates: { userId: string; sharedGames: number }[] = [];

        if (remaining > 0) {
          const tasteIds = new Set(tasteCandidates.map((c) => c.userId));
          const { data: followsRaw } = await supabase
            .from("follows")
            .select("followee_id")
            .limit(2000);
          const followCounts = new Map<string, number>();
          for (const f of (followsRaw ?? []) as { followee_id: string }[]) {
            followCounts.set(f.followee_id, (followCounts.get(f.followee_id) ?? 0) + 1);
          }
          popularCandidates = [...followCounts.entries()]
            .filter(([uid]) => !alreadyFollowedSet.has(uid) && uid !== user!.id && !tasteIds.has(uid))
            .sort((a, b) => b[1] - a[1])
            .slice(0, remaining)
            .map(([userId]) => ({ userId, sharedGames: 0 }));
        }

        const allCandidates = [...tasteCandidates, ...popularCandidates];
        if (allCandidates.length === 0) return [];

        const candidateIds = allCandidates.map((c) => c.userId);
        const [profilesRes, favsRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", candidateIds),
          supabase
            .from("favourite_games")
            .select("user_id, position, games(cover_url)")
            .in("user_id", candidateIds)
            .order("position"),
        ]);

        const profiles = (profilesRes.data ?? []) as {
          id: string; username: string; display_name: string | null; avatar_url: string | null;
        }[];
        const favs = (favsRes.data ?? []) as {
          user_id: string; games: { cover_url: string | null } | null;
        }[];

        const favsByUser = new Map<string, string[]>();
        for (const fav of favs) {
          if (!fav.games?.cover_url) continue;
          const arr = favsByUser.get(fav.user_id) ?? [];
          if (arr.length < 3) arr.push(fav.games.cover_url);
          favsByUser.set(fav.user_id, arr);
        }

        const profileMap = new Map(profiles.map((p) => [p.id, p]));
        return allCandidates
          .map((c) => {
            const p = profileMap.get(c.userId);
            if (!p) return null;
            return {
              id: p.id,
              username: p.username,
              displayName: p.display_name ?? p.username,
              avatarUrl: p.avatar_url,
              sharedGames: c.sharedGames,
              favouriteCovers: favsByUser.get(p.id) ?? [],
            } satisfies SuggestedUser;
          })
          .filter((s): s is SuggestedUser => s !== null);
      } catch {
        return [];
      }
    }

    // Use IGDB results if available; otherwise fall back to most-logged on Waypoint.
    let popularGames: GameStub[] = igdbPopularGames ?? [];

    if (popularGames.length < 4) {
      // Fallback: aggregate game popularity from Waypoint game_logs.
      type PopularRow = { game_id: number; games: GameStub | null };
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: recentRaw } = await supabase
        .from("game_logs")
        .select("game_id, games(id, slug, title, cover_url, igdb_rating)")
        .gte("created_at", thirtyDaysAgo)
        .limit(300);
      const recentRows = (recentRaw ?? []) as unknown as PopularRow[];
      const popularMap = new Map<number, { count: number; game: GameStub }>();
      for (const row of recentRows) {
        if (!row.games) continue;
        const entry = popularMap.get(row.game_id);
        if (entry) entry.count++;
        else popularMap.set(row.game_id, { count: 1, game: row.games });
      }
      popularGames = [...popularMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((v) => v.game);

      // If still sparse, widen to all-time logs.
      if (popularGames.length < 4) {
        const { data: allTimeRaw } = await supabase
          .from("game_logs")
          .select("game_id, games(id, slug, title, cover_url, igdb_rating)")
          .limit(300);
        const allTimeRows = (allTimeRaw ?? []) as unknown as PopularRow[];
        const allTimeMap = new Map<number, { count: number; game: GameStub }>();
        for (const row of allTimeRows) {
          if (!row.games) continue;
          const entry = allTimeMap.get(row.game_id);
          if (entry) entry.count++;
          else allTimeMap.set(row.game_id, { count: 1, game: row.games });
        }
        popularGames = [...allTimeMap.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
          .map((v) => v.game);
      }
    }

    // Phase 2: feed + who-to-follow suggestions in parallel.
    const [feedResult, suggestions] = await Promise.all([
      followedIds.length > 0
        ? supabase
            .from("game_logs")
            .select(
              "id, status, created_at, updated_at, " +
                "games(id, slug, title, cover_url), " +
                "profiles(username, display_name, avatar_url), " +
                "reviews!log_id(rating)"
            )
            .in("user_id", followedIds)
            .in("status", ["playing", "played", "dropped"])
            .order("updated_at", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] }),
      buildSuggestions(),
    ]);
    const { data: rawFeed } = feedResult;

    const username    = profile?.username ?? "there";
    const displayName = profile?.display_name ?? username;
    const feed        = (rawFeed ?? []) as unknown as FeedItem[];
    const isFollowingNobody = followedIds.length === 0;
    const allLists    = (recentListsRes.data ?? []) as unknown as RecentListItem[];
    const recentLists = allLists.filter((l) => l.list_entries.length > 0).slice(0, 6);

    const showWelcome = searchParams.welcome === "1";

    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        {showWelcome && <WelcomeToast displayName={displayName} />}

        {/* ── Welcome Banner ───────────────────────────────────────────────── */}
        <section
          className="mb-10 rounded-xl border border-white/5 px-6 py-5"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(13,13,26,0) 100%)" }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            {/* Left: avatar + name + stats */}
            <div className="flex items-center gap-4">
              {profile?.avatar_url ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-violet-500/50">
                  <Image src={profile.avatar_url} alt={displayName} fill sizes="56px" className="object-cover" />
                </div>
              ) : (
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white ring-2 ring-violet-500/50 ${avatarBg(username)}`}>
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-white">Welcome back, {displayName}</h1>
                <p className="mt-1 text-sm text-zinc-500">
                  {gamesLoggedCount} game{gamesLoggedCount !== 1 ? "s" : ""} logged
                  {" · "}
                  {followedIds.length} following
                </p>
              </div>
            </div>

            {/* Right: currently playing or log-a-game CTA */}
            <div className="shrink-0">
              {currentlyPlaying ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Currently Playing</p>
                  <Link
                    href={`/games/${currentlyPlaying.slug}`}
                    className="group flex items-center gap-3"
                  >
                    <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                      {currentlyPlaying.cover_url && (
                        <Image
                          src={igdbCover(currentlyPlaying.cover_url, "t_cover_small")!}
                          alt={currentlyPlaying.title}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <span className="max-w-[180px] font-medium text-white transition-colors group-hover:text-zinc-300 line-clamp-2">
                      {currentlyPlaying.title}
                    </span>
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs text-zinc-500">What have you been playing?</p>
                  <Link
                    href="/search"
                    className="inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                  >
                    + Log a Game
                  </Link>
                </div>
              )}
            </div>

          </div>
        </section>

        {/* ── Popular Right Now ─────────────────────────────────────────────── */}
        {popularGames.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-yellow-400"
                aria-hidden="true"
              >
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Popular Right Now
            </h2>
            <PopularCarousel games={popularGames} />
          </section>
        )}

        {/* ── New From Friends ──────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">New From Friends</h2>
            <Link
              href="/activity"
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              All Activity →
            </Link>
          </div>

          {feed.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
              {isFollowingNobody ? (
                <>
                  <p className="text-sm text-zinc-500">
                    Follow some people to see their activity here.
                  </p>
                  <Link
                    href="/search?tab=users"
                    className="mt-3 inline-block text-sm text-violet-400 transition-colors hover:text-violet-300"
                  >
                    Find People →
                  </Link>
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  No activity yet — log some games to see the feed come alive.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {feed.map((item) => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* ── Coming Soon ───────────────────────────────────────────────────── */}
        {upcomingGames.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-400"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Coming Soon
            </h2>
            <UpcomingCarousel games={upcomingGames} />
          </section>
        )}

        {/* ── Who to Follow ─────────────────────────────────────────────────── */}
        {suggestions.length > 0 && (
          <WhoToFollowWidget suggestions={suggestions} currentUserId={user.id} />
        )}

        {/* ── Recent Lists ──────────────────────────────────────────────────── */}
        {recentLists.length > 0 && (
          <section>
            <h2 className="mb-4 text-base font-semibold text-white">Recent Lists</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {recentLists.map((list) => (
                <RecentListCard key={list.id} list={list} />
              ))}
            </div>
          </section>
        )}

      </main>
    );
  }

  // ── Logged-out state ─────────────────────────────────────────────────────

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Pick a hero slug from the curated list, then fetch popular games and the
  // hero game detail in parallel (they're independent of each other).
  const heroSlug =
    HERO_GAME_SLUGS[Math.floor(Math.random() * HERO_GAME_SLUGS.length)];

  const [popularRes, heroDetailRes, upcomingRes, recentListsResLoggedOut] = await Promise.all([
    fetch(`${supabaseUrl}/functions/v1/igdb-popular`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }).catch(() => null),

    fetch(`${supabaseUrl}/functions/v1/igdb-game-detail`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug: heroSlug }),
      next: { revalidate: 3600 },
    }).catch(() => null),

    fetch(`${supabaseUrl}/functions/v1/igdb-upcoming`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }).catch(() => null),

    supabase
      .from("lists")
      .select(`
        id, title, description, created_at,
        profiles!lists_user_id_fkey(username, display_name, avatar_url),
        list_entries(position, games(cover_url)),
        list_likes(id)
      `)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  let popularGames: GameStub[] = [];
  if (popularRes?.ok) {
    const data = await popularRes.json();
    popularGames = (data.results as GameStub[]) ?? [];
  }

  let upcomingGamesLoggedOut: UpcomingGame[] = [];
  if (upcomingRes?.ok) {
    const data = await upcomingRes.json();
    upcomingGamesLoggedOut = (data.results as UpcomingGame[]) ?? [];
  }

  const allListsLoggedOut = (recentListsResLoggedOut.data ?? []) as unknown as RecentListItem[];
  const recentListsLoggedOut = allListsLoggedOut.filter((l) => l.list_entries.length > 0).slice(0, 6);

  // Hero background: artwork-first (marketing moment), screenshot fallback.
  // Opposite priority to the game detail page (screenshots-first there).
  let heroArtworkUrl: string | null = null;
  if (heroDetailRes?.ok) {
    const data = await heroDetailRes.json();
    type ImageRef = { url: string; width: number; height: number };
    const artworks: ImageRef[]   = data._debug?.artworks   ?? [];
    const screenshots: ImageRef[] = data._debug?.screenshots ?? [];
    const landscapeArt = artworks.find(
      (a) => a.width / a.height >= 1.7 && a.width / a.height <= 2.5 && a.height >= 700
    );
    const screenshot = screenshots.find(
      (s) => (s.width ?? 0) >= 1280 && (s.height ?? 0) >= 700
    );
    const rawUrl = (landscapeArt ?? screenshot)?.url ?? null;
    heroArtworkUrl = rawUrl
      ? `https:${rawUrl}`.replace(/\/t_[^/]+\//, "/t_1080p/")
      : null;
  }

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen overflow-hidden bg-[#0D0D1A]">

        {heroArtworkUrl && (
          <Image
            src={heroArtworkUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
            priority
            aria-hidden="true"
          />
        )}

        <div
          className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/60 to-zinc-950"
          aria-hidden="true"
        />

        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <h1 className="font-serif text-6xl font-bold tracking-tight text-white drop-shadow-2xl sm:text-7xl md:text-8xl">
            Waypoint
          </h1>
          <p className="mt-4 max-w-md text-lg text-zinc-300 sm:text-xl">
            Your gaming life, logged and shared.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-lg bg-violet-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-violet-500"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-zinc-500 px-8 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white hover:text-white"
            >
              Log In
            </Link>
          </div>
        </div>

      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="bg-zinc-950 px-4 py-20">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 sm:grid-cols-3">
          <Feature
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M8 10v4" />
                <circle cx="15" cy="12" r="1" />
                <circle cx="18" cy="12" r="1" />
              </svg>
            }
            heading="Log Everything"
            body="Every game you play, rated and remembered."
          />
          <Feature
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            }
            heading="Rate & Review"
            body="Share your takes with people who get it."
          />
          <Feature
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            heading="Follow Friends"
            body="See what your community is playing."
          />
        </div>
      </section>

      {/* ── Popular Right Now ───────────────────────────────────────────────── */}
      {popularGames.length > 0 && (
        <section className="bg-zinc-950 px-4 pb-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-base font-semibold text-white">
              Popular Right Now
            </h2>
            <PopularCarousel games={popularGames} />
          </div>
        </section>
      )}

      {/* ── Coming Soon ─────────────────────────────────────────────────────── */}
      {upcomingGamesLoggedOut.length > 0 && (
        <section className="bg-zinc-950 px-4 pb-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 flex items-center gap-2 text-base font-semibold text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-400"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Coming Soon
            </h2>
            <UpcomingCarousel games={upcomingGamesLoggedOut} />
          </div>
        </section>
      )}

      {/* ── Recent Lists ────────────────────────────────────────────────────── */}
      {recentListsLoggedOut.length > 0 && (
        <section className="bg-zinc-950 px-4 pb-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-base font-semibold text-white">Recent Lists</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {recentListsLoggedOut.map((list) => (
                <RecentListCard key={list.id} list={list} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-800 bg-zinc-950 px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-white">
          Ready to start logging?
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Join and track everything you play.
        </p>
        <Link
          href="/register"
          className="mt-6 inline-block rounded-lg bg-violet-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
        >
          Create your account
        </Link>
      </section>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Feature({
  icon,
  heading,
  body,
}: {
  icon: ReactNode;
  heading: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
      <div className="mb-4 text-violet-400">{icon}</div>
      <h3 className="text-base font-semibold text-white">{heading}</h3>
      <p className="mt-1 text-sm text-zinc-400">{body}</p>
    </div>
  );
}

// Letterboxd-style activity card for the friend feed grid.
// The cover and avatar are separate <Link> elements (never nested) so both
// are clickable independently — cover → game page, avatar → user profile.
function ActivityCard({ item }: { item: FeedItem }) {
  const { created_at, games, profiles, reviews } = item;
  if (!games || !profiles) return null;

  const rating = reviews?.rating ?? null;
  const displayName = profiles.display_name ?? profiles.username;
  const date = formatDate(created_at);
  const coverUrl = igdbCover(games.cover_url, "t_720p");

  return (
    <div className="group relative">

      {/* Cover image — links to the game detail page */}
      <Link
        href={`/games/${games.slug}`}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800"
      >
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={games.title}
            fill
            sizes="(max-width: 640px) 33vw, 17vw"
            quality={90}
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <NoCover />
        )}
        {rating !== null && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-yellow-400"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-[10px] font-medium text-yellow-400">{rating}</span>
          </div>
        )}
      </Link>

      {/* Avatar — absolute over the cover, sibling of cover Link (never nested inside it) */}
      <Link
        href={`/user/${profiles.username}`}
        className="absolute bottom-1.5 left-1.5 z-10"
        title={displayName}
      >
        {profiles.avatar_url ? (
          <div className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-zinc-950">
            <Image
              src={profiles.avatar_url}
              alt={displayName}
              fill
              sizes="24px"
              className="object-cover"
            />
          </div>
        ) : (
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-1 ring-zinc-950 ${avatarBg(profiles.username)}`}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>

      {/* Below-cover row: date */}
      <div className="mt-1.5 text-right">
        <span className="text-[10px] text-zinc-600">{date}</span>
      </div>

    </div>
  );
}

// Letterboxd-style list card with overlapping cover fan, info, and author footer.
// Uses an invisible overlay <Link> for the card hit-area so the author link
// (relative z-10) can sit on top without nesting <a> inside <a>.
function RecentListCard({ list }: { list: RecentListItem }) {
  const profile = list.profiles;
  if (!profile) return null;

  const covers = [...list.list_entries]
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .slice(0, 4)
    .map((e) => e.games?.cover_url ?? null)
    .filter((c): c is string => c !== null);

  const gameCount  = list.list_entries.length;
  const likeCount  = list.list_likes.length;
  const displayName = profile.display_name ?? profile.username;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:bg-white/5">
      {/* Full-card overlay link — sits below avatar/author link */}
      <Link
        href={`/user/${profile.username}/lists/${list.id}`}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={list.title}
      />

      {/* Cover fan */}
      <div className="flex items-end overflow-hidden rounded-t-xl bg-zinc-800/60 px-3 pt-3 pb-2">
        {covers.length > 0 ? (
          covers.map((url, i) => (
            <div
              key={i}
              className={`relative h-[100px] w-[70px] shrink-0 overflow-hidden rounded-md ${i > 0 ? "-ml-4" : ""}`}
              style={{ zIndex: covers.length - i }}
            >
              <Image
                src={igdbCover(url, "t_cover_big")!}
                alt=""
                fill
                sizes="70px"
                className="object-cover"
              />
            </div>
          ))
        ) : (
          <div className="h-[100px] w-full rounded-md bg-zinc-800" />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <p className="line-clamp-1 font-semibold text-white">{list.title}</p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{gameCount} {gameCount === 1 ? "game" : "games"}</span>
          {likeCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {likeCount}
              </span>
            </>
          )}
        </div>
        {list.description && (
          <p className="line-clamp-2 text-xs italic leading-snug text-zinc-500">{list.description}</p>
        )}
      </div>

      {/* Author footer — z-10 so it sits above the card overlay link */}
      <div className="relative z-10 flex items-center gap-2 border-t border-zinc-800 px-4 py-2.5">
        <Link
          href={`/user/${profile.username}`}
          className="flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-white"
        >
          {profile.avatar_url ? (
            <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
              <Image src={profile.avatar_url} alt={displayName} fill sizes="20px" className="object-cover" />
            </div>
          ) : (
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarBg(profile.username)}`}>
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          {displayName}
        </Link>
      </div>
    </div>
  );
}

function NoCover() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-zinc-600"
        aria-hidden="true"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 12h4M8 10v4" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="18" cy="12" r="1" />
      </svg>
    </div>
  );
}
