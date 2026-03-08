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
      <h1 className="mb-8 text-2xl font-bold text-white">{displayName}&apos;s Stats</h1>

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
            className="mt-4 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
          >
            Search for games to log →
          </Link>
        </div>
      )}

    </main>
  );
}
