"use client";

// Client component for the friend activity grid.
// Receives the first page of items from the Server Component and handles
// "Load More" by querying Supabase directly from the browser.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { igdbCover } from "@/lib/igdb";

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
  } | null;
  reviews: { rating: number | null } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48;

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialItems: FeedItem[];
  followedIds: string[];
  userId: string;
  initialHasMore: boolean;
}

export function ActivityFeed({ initialItems, followedIds, userId, initialHasMore }: Props) {
  const [items, setItems]     = useState<FeedItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("game_logs")
      .select(
        "id, status, created_at, updated_at, " +
          "games(id, slug, title, cover_url), " +
          "profiles(username, display_name, avatar_url), " +
          "reviews!log_id(rating)"
      )
      .in("user_id", followedIds)
      .neq("user_id", userId)
      .order("updated_at", { ascending: false })
      .range(items.length, items.length + PAGE_SIZE - 1);

    const next = (data ?? []) as unknown as FeedItem[];
    setItems((prev) => [...prev, ...next]);
    setHasMore(next.length === PAGE_SIZE);
    setLoading(false);
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
        No activity yet — your friends haven&apos;t logged anything recently.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <ActivityCard key={item.id} item={item} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ActivityCard ─────────────────────────────────────────────────────────────
// Cover + rating badge + friend avatar overlay, then game title + date below.
// Cover and avatar are separate links so both are independently clickable.

function ActivityCard({ item }: { item: FeedItem }) {
  const { created_at, games, profiles, reviews } = item;
  if (!games || !profiles) return null;

  const rating      = reviews?.rating ?? null;
  const displayName = profiles.display_name ?? profiles.username;
  const date        = formatDate(created_at);
  const coverUrl    = igdbCover(games.cover_url, "t_720p");

  return (
    <div className="group relative">

      {/* Cover — links to game detail page */}
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

        {/* Rating badge — bottom right */}
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

      {/* Friend avatar — absolute over cover, sibling (not nested inside cover link) */}
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

      {/* Game title + date */}
      <div className="mt-1.5 space-y-0.5">
        <Link
          href={`/games/${games.slug}`}
          className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors hover:text-white"
        >
          {games.title}
        </Link>
        <p className="text-[10px] text-zinc-600">{date}</p>
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
