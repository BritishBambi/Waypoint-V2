// apps/web/app/user/[username]/library/page.tsx
// Full game library for a user — all logged games sorted by release date (newest first).

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogWithGame = {
  id: string;
  status: string;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
    release_date: string | null;
  } | null;
  reviews: Array<{ id: string; rating: number | null }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: { username: string };
}

export default async function LibraryPage({ params }: Props) {
  const { username } = params;
  const supabase = await createClient();

  // Profile lookup — 404 if username doesn't exist.
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as Pick<Tables<"profiles">, "id" | "username" | "display_name"> | null;

  if (!profile) notFound();

  // Fetch all game logs joined with games (including release_date for sorting).
  const { data: rawLogs } = await supabase
    .from("game_logs")
    .select("id, status, games(id, slug, title, cover_url, release_date), reviews(id, rating)")
    .eq("user_id", profile.id);

  const logs = (rawLogs ?? []) as unknown as LogWithGame[];

  // Sort by game release_date descending (newest games first).
  // Games with no release_date sort to the end.
  logs.sort((a, b) => {
    const da = a.games?.release_date ?? "";
    const db = b.games?.release_date ?? "";
    return db.localeCompare(da);
  });

  const displayName = profile.display_name ?? profile.username;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* ── Breadcrumb ────────────────────────────────────────────────────────── */}
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

      {/* ── Heading + count ──────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-white">
          {displayName}&apos;s Library
        </h1>
        <span className="text-sm text-zinc-500">
          {logs.length} {logs.length === 1 ? "game" : "games"}
        </span>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      {logs.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          No games logged yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {logs.map(({ id, status, games, reviews }) =>
            games ? (
              <div key={id} className="group">
                {/* Cover + title → game page */}
                <Link href={`/games/${games.slug}`} className="block">
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">
                    {games.cover_url ? (
                      <Image
                        src={igdbCover(games.cover_url, "t_720p")!}
                        alt={games.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                        quality={90}
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <NoCover />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-xs font-medium text-zinc-300 transition-colors group-hover:text-white">
                    {games.title}
                  </p>
                </Link>

                {/* Status badge + rating/review indicators */}
                <div className="mt-1 space-y-1">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.shelved}`}
                  >
                    {STATUS_LABEL[status] ?? status}
                  </span>
                  {reviews.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {reviews[0].rating != null && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-yellow-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          {reviews[0].rating}
                        </span>
                      )}
                      <Link
                        href={`/review/${reviews[0].id}`}
                        className="flex items-center gap-0.5 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
                        title="View review"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Review
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NoCover() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
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
