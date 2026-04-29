"use client";

// Client component for the friend activity grid.
// Receives the first page of items from the Server Component and handles
// page navigation by querying Supabase directly from the browser.

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { igdbCover } from "@/lib/igdb";
import { avatarBg } from "@/lib/avatarBg";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedItem = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
  } | null;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    active_title: { name: string; color: string; steam_app_id: number | null; game: { cover_url: string | null; icon_hash: string | null } | null } | null;
  } | null;
  reviews: { rating: number | null } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialItems: FeedItem[];
  followedIds: string[];
  userId: string;
  totalCount: number;
}

export function ActivityFeed({ initialItems, followedIds, userId, totalCount }: Props) {
  const [items, setItems]           = useState<FeedItem[]>(initialItems);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading]       = useState(false);
  const gridRef                     = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function goToPage(page: number) {
    if (page < 1 || page > totalPages || loading) return;
    setLoading(true);

    const supabase = createClient();
    const offset   = (page - 1) * PAGE_SIZE;
    const { data } = await supabase
      .from("game_logs")
      .select(
        "id, status, created_at, updated_at, " +
          "games(id, slug, title, cover_url), " +
          "profiles(username, display_name, avatar_url, active_title:titles!active_title_id(name, color, steam_app_id, game:games(cover_url, icon_hash))), " +
          "reviews!log_id(rating)"
      )
      .in("user_id", followedIds)
      .neq("user_id", userId)
      .in("status", ["playing", "played", "dropped"])
      .order("updated_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    setItems((data ?? []) as unknown as FeedItem[]);
    setCurrentPage(page);
    setLoading(false);

    // Scroll to top of the grid after the state update paints.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (items.length === 0 && currentPage === 1) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
        No activity yet — your friends haven&apos;t logged anything recently.
      </p>
    );
  }

  return (
    <div>
      {/* Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6"
      >
        {items.map((item) => (
          <ActivityCard key={item.id} item={item} />
        ))}
      </div>

      {/* Pagination — only shown when there is more than one page */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1 || loading}
            aria-label="Previous page"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <span className="min-w-[80px] text-center text-sm text-zinc-400">
            {loading ? "Loading…" : `Page ${currentPage} of ${totalPages}`}
          </span>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages || loading}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ActivityCard ─────────────────────────────────────────────────────────────
//
// Structure (solves the overlap bug):
//
//   <div flex-col>               ← outer card, owns vertical space
//     <div relative>             ← cover area only — avatar positions within this
//       <Link cover overflow-hidden>
//         <Image />
//         <rating badge abs />
//       </Link>
//       <Link avatar abs />      ← absolute inside cover area, not the full card
//     </div>
//     <title />                  ← in normal flow, below cover
//     <date />
//   </div>
//
// Previously the card root was `group relative` which made the avatar
// `absolute bottom-1.5` measure from the full card height (cover + text),
// causing it to land over the title row instead of the cover bottom.

function ActivityCard({ item }: { item: FeedItem }) {
  const { created_at, games, profiles, reviews } = item;
  if (!games || !profiles) return null;

  const rating      = reviews?.rating ?? null;
  const displayName = profiles.display_name ?? profiles.username;
  const date        = formatDate(created_at);
  const coverUrl    = igdbCover(games.cover_url, "t_720p");

  return (
    <div className="group flex flex-col gap-1.5">

      {/* ── Cover area — rating badge and avatar are both absolute inside here ── */}
      <div className="relative">

        {/* Cover image */}
        <Link
          href={`/games/${games.slug}`}
          className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800"
        >
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={games.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 17vw"
              quality={90}
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <NoCover />
          )}

          {/* Rating badge — bottom right, inside overflow-hidden */}
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

        {/* Friend avatar — absolute relative to the cover div (not the full card) */}
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

      </div>

      {/* ── Metadata — in normal flow, fully below the cover ─────────────────── */}
      <Link
        href={`/games/${games.slug}`}
        className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors hover:text-white"
      >
        {games.title}
      </Link>
      <p className="text-[10px] text-zinc-600">{date}</p>

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
