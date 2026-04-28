// apps/web/app/user/[username]/stats/page.tsx
// Dedicated stats page — genre breakdown, decade grid, and more (future).
// SSR — all computation done server-side, no client components needed.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import {
  GenreStatsSection,
  type GenreSlice,
  type DecadeData,
  type GenreStatsData,
} from "../GenreStatsSection";
import { formatPlaytime } from "@/lib/formatPlaytime";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogGenreData = {
  game_id: number | null;
  games: {
    genres: string[] | null;
    release_date: string | null;
    cover_url: string | null;
    slug: string;
  } | null;
};

type ReviewStub = {
  rating: number;
  games: { id: number } | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StatsPage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = params;
  const supabase = await createClient();

  // Profile lookup — 404 if not found.
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as Pick<
    Tables<"profiles">,
    "id" | "username" | "display_name"
  > | null;

  if (!profile) notFound();

  const displayName = profile.display_name ?? profile.username;

  const { data: { user } } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === profile.id;

  // Fetch genre data + reviews in parallel.
  const [genreDataRes, reviewsRes, totalLogsRes] = await Promise.all([
    supabase
      .from("game_logs")
      .select("game_id, games(genres, release_date, cover_url, slug)")
      .eq("user_id", profile.id)
      .neq("status", "wishlist"),

    supabase
      .from("reviews")
      .select("rating, games(id)")
      .eq("user_id", profile.id)
      .eq("is_draft", false),

    supabase
      .from("game_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .neq("status", "wishlist"),
  ]);

  const genreData = (genreDataRes.data ?? []) as unknown as LogGenreData[];
  const reviews   = (reviewsRes.data   ?? []) as unknown as ReviewStub[];
  const totalLogged = totalLogsRes.count ?? 0;

  // ── Steam data (own profile only) ─────────────────────────────────────────
  type SteamRow = { game_id: number | null; playtime_minutes: number; games: { title: string } | null };
  let steamRows: SteamRow[] = [];
  let hasSteam = false;
  if (isOwnProfile) {
    const { data: rawProfile2 } = await supabase
      .from("profiles")
      .select("steam_id")
      .eq("id", profile.id)
      .maybeSingle();
    if ((rawProfile2 as any)?.steam_id) {
      hasSteam = true;
      const { data: steamData } = await supabase
        .from("user_steam_data")
        .select("game_id, playtime_minutes, games(title)")
        .eq("user_id", profile.id)
        .gt("playtime_minutes", 0);
      steamRows = (steamData ?? []) as unknown as SteamRow[];
    }
  }

  const totalPlaytimeMinutes = steamRows.reduce((sum, r) => sum + r.playtime_minutes, 0);
  const mostPlayedRow = steamRows.length > 0
    ? steamRows.reduce((best, r) => r.playtime_minutes > best.playtime_minutes ? r : best)
    : null;

  // ── Genre stats computation ────────────────────────────────────────────────

  const genreGameMap = new Map<
    number,
    { genres: string[]; release_date: string | null; cover_url: string | null; slug: string }
  >();
  for (const log of genreData) {
    if (log.game_id != null && log.games) {
      genreGameMap.set(log.game_id, {
        genres: log.games.genres ?? [],
        release_date: log.games.release_date,
        cover_url: log.games.cover_url,
        slug: log.games.slug,
      });
    }
  }

  // Genre → { count, covers }
  const genreMap = new Map<string, { count: number; covers: string[] }>();
  for (const game of genreGameMap.values()) {
    for (const genre of game.genres) {
      const entry = genreMap.get(genre) ?? { count: 0, covers: [] };
      entry.count++;
      if (entry.covers.length < 3 && game.cover_url) entry.covers.push(game.cover_url);
      genreMap.set(genre, entry);
    }
  }

  const sortedGenres = [...genreMap.entries()].sort((a, b) => b[1].count - a[1].count);
  const top5      = sortedGenres.slice(0, 5);
  const restCount = sortedGenres.slice(5).reduce((sum, [, g]) => sum + g.count, 0);

  const genreSlices: GenreSlice[] = top5.map(([genre, { count, covers }]) => ({
    genre,
    count,
    percentage: totalLogged > 0 ? Math.round((count / totalLogged) * 100) : 0,
    covers,
  }));
  if (restCount > 0) {
    genreSlices.push({
      genre: "Other",
      count: restCount,
      percentage: Math.round((restCount / totalLogged) * 100),
      covers: [],
    });
  }

  // Highest rated genre — needs ≥ 3 rated reviews per genre.
  const genreRatings = new Map<string, number[]>();
  for (const review of reviews) {
    const gameId = (review.games as any)?.id as number | undefined;
    if (!gameId || !review.rating) continue;
    const gameGenres = genreGameMap.get(gameId)?.genres ?? [];
    for (const genre of gameGenres) {
      const arr = genreRatings.get(genre) ?? [];
      arr.push(review.rating);
      genreRatings.set(genre, arr);
    }
  }
  let highestRated: GenreStatsData["highestRated"] = null;
  let bestAvg = 0;
  for (const [genre, ratings] of genreRatings) {
    if (ratings.length < 3) continue;
    const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      highestRated = { genre, avgRating: avg, covers: genreMap.get(genre)?.covers ?? [] };
    }
  }

  // Decades — newest decade first, up to 10 covers per decade sorted newest game first.
  const decadeMap = new Map<
    number,
    { count: number; games: Array<{ cover_url: string | null; slug: string; release_date: string }> }
  >();
  for (const game of genreGameMap.values()) {
    if (!game.release_date) continue;
    const year   = new Date(game.release_date).getUTCFullYear();
    const decade = Math.floor(year / 10) * 10;
    const entry  = decadeMap.get(decade) ?? { count: 0, games: [] };
    entry.count++;
    entry.games.push({ cover_url: game.cover_url, slug: game.slug, release_date: game.release_date });
    decadeMap.set(decade, entry);
  }
  const decades: DecadeData[] = [...decadeMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, { count, games }]) => ({
      decade,
      count,
      games: games
        .sort((a, b) => b.release_date.localeCompare(a.release_date))
        .slice(0, 10)
        .map(({ cover_url, slug }) => ({ cover_url, slug })),
    }));

  const hasEnoughData = totalLogged >= 3 && (genreSlices.length > 0 || decades.length > 0);

  const genreStatsData: GenreStatsData = {
    totalLogged,
    genreSlices,
    mostPlayed: genreSlices.find((s) => s.genre !== "Other") ?? null,
    highestRated,
    decades,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <Link
        href={`/user/${username}`}
        className="mb-8 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to profile
      </Link>

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <h1 className="font-serif mb-8 text-2xl font-bold text-white">{displayName}&apos;s Stats</h1>

      {/* ── Steam Library ─────────────────────────────────────────────────── */}
      {hasSteam && totalPlaytimeMinutes > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="text-zinc-400" aria-hidden="true">
              <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.718L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.492 1.009 2.448-.397.957-1.488 1.41-2.445 1.019zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
            </svg>
            <h2 className="text-base font-semibold text-white">Steam Library</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Playtime</p>
              <p className="text-2xl font-bold text-white">{formatPlaytime(totalPlaytimeMinutes)}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{steamRows.length} games tracked</p>
            </div>
            {mostPlayedRow?.games && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Most Played</p>
                <p className="text-sm font-semibold text-white line-clamp-2 leading-snug">{mostPlayedRow.games.title}</p>
                <p className="text-xs text-violet-400 mt-1">{formatPlaytime(mostPlayedRow.playtime_minutes)}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {hasEnoughData ? (
        <>
          <GenreStatsSection data={genreStatsData} />

          {/* ── Future sections placeholder ─────────────────────────────────── */}
          {/* TODO: average rating given */}
          {/* TODO: games logged per year chart */}
          {/* TODO: platform breakdown */}
        </>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/50 py-20 text-center">
          <p className="text-base font-medium text-zinc-300">Not enough data yet</p>
          <p className="mt-2 text-sm text-zinc-500">
            Log more games to see your stats
          </p>
          <Link
            href="/search"
            className="mt-4 text-sm text-violet-400 transition-colors hover:text-violet-300"
          >
            Search for games to log →
          </Link>
        </div>
      )}

    </main>
  );
}
