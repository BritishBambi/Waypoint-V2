// apps/web/app/games/[slug]/page.tsx
// Server-side rendered game detail page.
// Fetches game data via the igdb-game-detail Edge Function (which also upserts
// the game into Supabase), then loads reviews and the current user's log in
// parallel before handing off interactive pieces to Client Components.

import Image from "next/image";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { GameLogSection } from "./GameLogSection";
import { ReviewSection } from "./ReviewSection";

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape returned by the igdb-game-detail Edge Function.
// Matches the games table minus igdb_synced_at, plus rating_count (IGDB-only).
export type GameDetail = Omit<Tables<"games">, "igdb_synced_at"> & {
  rating_count: number | null;
};

// Review row joined with the author's public profile columns.
export type ReviewWithAuthor = Tables<"reviews"> & {
  profiles: Pick<
    Tables<"profiles">,
    "username" | "display_name" | "avatar_url"
  > | null;
};

// Serialisable slice of a game_log row passed to Client Components.
export type LogSummary = Pick<Tables<"game_logs">, "id" | "status">;

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: { slug: string };
}

export default async function GameDetailPage({ params }: Props) {
  const { slug } = params;

  // ── 1. Fetch game from IGDB (and sync it into the games table) ──────────────
  // Use a direct fetch to the Edge Function rather than supabase.functions.invoke.
  // From a Server Component, functions.invoke goes through the SSR auth machinery
  // (cookie reads, session hydration) which can fail silently for unauthenticated
  // calls and always collapses every non-2xx into the same generic error — making
  // it impossible to tell "game not found" (404) from "server crashed" (5xx).
  // Direct fetch gives us the real status code so we can handle each case correctly.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const fnRes = await fetch(
    `${supabaseUrl}/functions/v1/igdb-game-detail`,
    {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug }),
      // Don't let Next.js cache this — game data should always be fresh from IGDB.
      cache: "no-store",
    }
  );

  if (fnRes.status === 404) {
    // The Edge Function confirmed this slug doesn't exist in IGDB.
    notFound();
  }

  if (!fnRes.ok) {
    // A server error occurred — surface it as a real error so Next.js shows the
    // error page with the actual message, not a misleading 404.
    const body = await fnRes.text().catch(() => "no response body");
    throw new Error(
      `igdb-game-detail returned ${fnRes.status}: ${body}`
    );
  }

  const { game }: { game: GameDetail } = await fnRes.json();

  if (!game) {
    notFound();
  }

  // ── 2. Supabase queries — auth + reviews + user's log ───────────────────────
  const supabase = await createClient();

  const [{ data: { user } }, { data: rawReviews }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("reviews")
      .select("*, profiles(username, display_name, avatar_url)")
      .eq("game_id", game.id)
      .eq("is_draft", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(20),
  ]);

  const reviews = (rawReviews ?? []) as ReviewWithAuthor[];

  // Fetch the user's existing game_log (if logged in).
  let existingLog: LogSummary | null = null;
  let existingReview: Pick<Tables<"reviews">, "id" | "rating" | "body"> | null = null;

  if (user) {
    const { data: logRow } = await supabase
      .from("game_logs")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("game_id", game.id)
      .maybeSingle();

    existingLog = logRow ?? null;

    if (existingLog) {
      const { data: reviewRow } = await supabase
        .from("reviews")
        .select("id, rating, body")
        .eq("log_id", existingLog.id)
        .maybeSingle();

      existingReview = reviewRow ?? null;
    }
  }

  // ── 3. Derived display values ───────────────────────────────────────────────
  const year = game.release_date ? game.release_date.slice(0, 4) : null;
  const platforms = game.platforms?.slice(0, 4).join(" · ") ?? null;
  // Upgrade the stored cover URL to t_720p (~480×720) for crisp display.
  const hdCoverUrl = igdbCover(game.cover_url, "t_720p");
  const communityScore =
    game.igdb_rating != null
      ? (game.igdb_rating / 10).toFixed(1)
      : null;

  // ── 4. Render ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[240px_1fr]">

          {/* Cover image */}
          <div className="mx-auto w-full max-w-[240px] md:mx-0">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-800 shadow-2xl shadow-black/60">
              {hdCoverUrl ? (
                <Image
                  src={hdCoverUrl}
                  alt={`${game.title} cover`}
                  fill
                  sizes="240px"
                  className="object-cover"
                  priority
                />
              ) : (
                <NoCoverPlaceholder />
              )}
            </div>
          </div>

          {/* Game info */}
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              {game.title}
            </h1>

            {/* Year + platforms */}
            {(year || platforms) && (
              <p className="mt-2 text-sm text-zinc-400">
                {[year, platforms].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Genre pills */}
            {game.genres && game.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {game.genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-zinc-700 px-3 py-0.5 text-xs text-zinc-300"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* IGDB community score */}
            {communityScore && (
              <div className="mt-4 flex items-center gap-2">
                <StarIcon className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                <span className="text-lg font-semibold text-white">
                  {communityScore}
                </span>
                <span className="text-sm text-zinc-500">
                  / 10 community score
                  {game.rating_count
                    ? ` · ${game.rating_count.toLocaleString()} ratings`
                    : ""}
                </span>
              </div>
            )}

            {/* Summary */}
            {game.summary && (
              <p className="mt-4 max-w-prose text-sm leading-relaxed text-zinc-300 sm:text-base">
                {game.summary}
              </p>
            )}

            {/* Log button / status — Client Component */}
            <div className="mt-6">
              <GameLogSection
                game={{
                  id: game.id,
                  title: game.title,
                  slug: game.slug,
                  cover_url: game.cover_url,
                  summary: game.summary,
                  genres: game.genres,
                  platforms: game.platforms,
                  release_date: game.release_date,
                  igdb_rating: game.igdb_rating,
                }}
                userId={user?.id ?? null}
                existingLog={existingLog}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <ReviewSection
          reviews={reviews}
          gameId={game.id}
          userId={user?.id ?? null}
          existingLog={existingLog}
          existingReview={existingReview}
        />
      </section>

    </main>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function NoCoverPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
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

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
