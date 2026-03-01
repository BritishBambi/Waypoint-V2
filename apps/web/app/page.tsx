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

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600",
];

const STATUS_BADGE: Record<string, string> = {
  playing:  "bg-teal-500/20   text-teal-300   border-teal-500/40",
  played:   "bg-violet-500/20 text-violet-300 border-violet-500/40",
  wishlist: "bg-amber-500/20  text-amber-300  border-amber-500/40",
  dropped:  "bg-red-900/30    text-red-400    border-red-800/50",
  shelved:  "bg-zinc-700/30   text-zinc-400   border-zinc-700/50",
};

const STATUS_LABEL: Record<string, string> = {
  playing: "Playing", played: "Played", wishlist: "Wishlist",
  dropped: "Dropped", shelved: "Shelved",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Logged-in state ───────────────────────────────────────────────────────

  if (user) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Phase 1: profile, follows, own library, and IGDB popular games (all parallel).
    // igdb-popular is tried first; Waypoint game_logs is used only as a fallback.
    const [profileRes, followRes, ownRes, igdbPopularGames] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", user.id)
        .single(),

      supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id),

      // Library shortcut: user's 4 most recently touched logs.
      supabase
        .from("game_logs")
        .select("id, status, games(id, slug, title, cover_url)")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(4),

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
    ]);

    const profile     = profileRes.data as { username: string; display_name: string | null } | null;
    const followRows  = followRes.data as Array<{ followee_id: string }> | null;
    const followedIds = (followRows ?? []).map((r) => r.followee_id);

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

    // Phase 2: feed filtered to followed users only (own activity is in "Your Library" below).
    const feedQuery =
      followedIds.length > 0
        ? await supabase
            .from("game_logs")
            .select(
              "id, status, created_at, updated_at, " +
                "games(id, slug, title, cover_url), " +
                "profiles(username, display_name, avatar_url), " +
                "reviews!log_id(rating)"
            )
            .in("user_id", followedIds)
            .order("updated_at", { ascending: false })
            .limit(12)
        : { data: [] };
    const { data: rawFeed } = feedQuery;

    const username    = profile?.username ?? "there";
    const displayName = profile?.display_name ?? username;
    const feed        = (rawFeed ?? []) as unknown as FeedItem[];
    const ownLogs     = (ownRes.data ?? []) as unknown as OwnLog[];
    const isFollowingNobody = followedIds.length === 0;

    return (
      <main className="mx-auto max-w-6xl px-4 py-10">

        {/* ── Welcome bar ──────────────────────────────────────────────────── */}
        <section className="mb-10">
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {displayName}
          </h1>
          <Link
            href="/search"
            className="mt-4 flex w-full max-w-sm items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            What are you playing?
          </Link>
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
              href={`/user/${username}`}
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

        {/* ── Library shortcut ──────────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Your Library</h2>
            <Link
              href={`/user/${username}`}
              className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
            >
              View all →
            </Link>
          </div>
          {ownLogs.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nothing logged yet.{" "}
              <Link href="/search" className="text-indigo-400 hover:text-indigo-300">
                Find a game to start →
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {ownLogs.map(({ id, status, games }) =>
                games ? (
                  <Link key={id} href={`/games/${games.slug}`} className="group">
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">
                      {games.cover_url ? (
                        <Image
                          src={igdbCover(games.cover_url, "t_720p")!}
                          alt={games.title}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          quality={90}
                          className="object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <NoCover />
                      )}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <p className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors group-hover:text-white">
                        {games.title}
                      </p>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.shelved}`}
                      >
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </div>
                  </Link>
                ) : null
              )}
            </div>
          )}
        </section>

      </main>
    );
  }

  // ── Logged-out state ─────────────────────────────────────────────────────

  // Trending: fetch a batch of recent logs to aggregate by game_id in JS.
  const { data: logsRaw } = await supabase
    .from("game_logs")
    .select("game_id, games(id, slug, title, cover_url)")
    .limit(200);

  type LogRow = { game_id: number; games: GameStub | null };
  const logRows = (logsRaw ?? []) as unknown as LogRow[];
  const countMap = new Map<number, { count: number; game: GameStub }>();
  for (const row of logRows) {
    if (!row.games) continue;
    const entry = countMap.get(row.game_id);
    if (entry) {
      entry.count += 1;
    } else {
      countMap.set(row.game_id, { count: 1, game: row.games });
    }
  }
  const trendingGames = [...countMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((v) => v.game);

  // Hero artwork: fetch a high-res landscape image for the most-logged game.
  let heroArtworkUrl: string | null = null;
  const heroGame = trendingGames[0];
  if (heroGame) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    try {
      const artRes = await fetch(
        `${supabaseUrl}/functions/v1/igdb-artwork`,
        {
          method: "POST",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ game_id: heroGame.id }),
          next: { revalidate: 3600 },
        }
      );
      if (artRes.ok) {
        const data = await artRes.json();
        heroArtworkUrl = data.artwork_url ?? null;
      }
    } catch {
      // Non-fatal — fall back to the dark solid background.
    }
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
              Get Started
            </Link>
            <Link
              href="/search"
              className="rounded-lg border border-zinc-500 px-8 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white hover:text-white"
            >
              Browse Games
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

      {/* ── Trending ────────────────────────────────────────────────────────── */}
      {trendingGames.length > 0 && (
        <section className="bg-zinc-950 px-4 pb-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-6 text-base font-semibold text-white">
              Popular Right Now
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {trendingGames.map((game) => (
                <Link
                  key={game.id}
                  href={`/games/${game.slug}`}
                  className="group shrink-0"
                >
                  <div className="relative aspect-[2/3] w-28 overflow-hidden rounded-lg bg-zinc-800">
                    {game.cover_url ? (
                      <Image
                        src={game.cover_url.replace(/\/t_[^/]+\//, "/t_720p/")}
                        alt={game.title}
                        fill
                        sizes="112px"
                        quality={90}
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <NoCover />
                    )}
                  </div>
                  <p className="mt-1.5 w-28 line-clamp-2 text-xs text-zinc-400 transition-colors group-hover:text-white">
                    {game.title}
                  </p>
                </Link>
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
