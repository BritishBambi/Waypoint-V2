// apps/web/app/games/[slug]/page.tsx
// Server-side rendered game detail page.
// Fetches game data via the igdb-game-detail Edge Function (which also upserts
// the game into Supabase), then loads reviews and the current user's log in
// parallel before handing off interactive pieces to Client Components.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { GameLogSection } from "./GameLogSection";
import { ReviewSection } from "./ReviewSection";

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape returned by the igdb-game-detail Edge Function.
// Matches the games table minus igdb_synced_at, plus IGDB-only UI fields.
export type GameDetail = Omit<Tables<"games">, "igdb_synced_at"> & {
  rating_count: number | null;
  banner_url: string | null;
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

// DLC / expansion item returned by igdb-game-detail alongside the main game.
export type DlcItem = {
  id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  release_date: string | null;
  category: number;
  summary: string | null;
};

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

  const { game, dlc = [] }: { game: GameDetail; dlc: DlcItem[] } = await fnRes.json();

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
      ? (game.igdb_rating / 20).toFixed(1)
      : null;

  // ── 4. Render ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen">

      {/* ── Backdrop banner ───────────────────────────────────────────────── */}
      <div className="relative h-[280px] w-full overflow-hidden">
        {game.banner_url ? (
          <Image
            src={game.banner_url}
            alt=""
            fill
            sizes="100vw"
            quality={85}
            className="object-cover object-top"
            priority
            aria-hidden="true"
          />
        ) : null}
        {/* Single bottom gradient — image is sharp at top, dissolves at the bottom edge */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(13,13,26,0.3) 0%, rgba(13,13,26,0.5) 60%, rgba(13,13,26,1) 100%)",
          }}
        />
      </div>

      {/* ── Hero — cover + info ───────────────────────────────────────────── */}
      {/* Title sits here on the dark page background, below the backdrop */}
      <section className="mx-auto max-w-6xl px-4 pb-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">

          {/* Cover image */}
          <div className="mx-auto shrink-0 md:mx-0">
            <div className="relative aspect-[2/3] w-[160px] overflow-hidden rounded-xl bg-zinc-800 shadow-2xl shadow-black/60 md:w-[200px]">
              {hdCoverUrl ? (
                <Image
                  src={hdCoverUrl}
                  alt={`${game.title} cover`}
                  fill
                  sizes="(max-width: 768px) 50vw, 200px"
                  quality={90}
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
                  / 5 community score
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

      {/* ── DLC & Expansions ─────────────────────────────────────────────────── */}
      {dlc.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            DLC &amp; Expansions
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {dlc.map((item) => (
              <DlcCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

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

function DlcCard({ item }: { item: DlcItem }) {
  const year = item.release_date ? item.release_date.slice(0, 4) : null;
  const coverUrl = igdbCover(item.cover_url, "t_720p");

  return (
    <Link
      href={`/games/${item.slug}`}
      className="group flex w-[120px] shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={item.title}
            fill
            sizes="120px"
            quality={90}
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
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
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-white">
          {item.title}
        </p>
        {year && <p className="text-xs text-zinc-500">{year}</p>}
      </div>
    </Link>
  );
}
