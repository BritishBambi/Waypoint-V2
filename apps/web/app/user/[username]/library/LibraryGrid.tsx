"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { igdbCover } from "@/lib/igdb";
import { formatStatus } from "@/lib/formatStatus";
import type { LogWithGame } from "./page";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  playing:  "bg-teal-500/20   text-teal-300   border-teal-500/40",
  played:   "bg-violet-500/20 text-violet-300 border-violet-500/40",
  dropped:  "bg-red-900/30    text-red-400    border-red-800/50",
  backlog:  "bg-sky-500/20    text-sky-300    border-sky-500/40",
  shelved:  "bg-zinc-700/30   text-zinc-400   border-zinc-700/50",
};

const FILTER_TABS = [
  { label: "All",       value: null as string | null },
  { label: "Playing",   value: "playing" },
  { label: "Completed", value: "played" },
  { label: "Dropped",   value: "dropped" },
  { label: "Backlog",   value: "backlog" },
];

// ─── LibraryGrid ──────────────────────────────────────────────────────────────

interface Props {
  logs: LogWithGame[];
}

export function LibraryGrid({ logs }: Props) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const filtered = activeFilter
    ? logs.filter((l) => l.status === activeFilter)
    : logs;

  return (
    <div>
      {/* ── Status filter tabs ──────────────────────────────────────────────── */}
      <div className="mb-6 flex overflow-x-auto whitespace-nowrap border-b border-zinc-800">
        {FILTER_TABS.map(({ label, value }) => {
          const count = value
            ? logs.filter((l) => l.status === value).length
            : logs.length;
          const isActive = activeFilter === value;
          return (
            <button
              key={label}
              onClick={() => setActiveFilter(value)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "border-violet-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
              <span className="text-xs text-zinc-600">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          No games with this status.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {filtered.map(({ id, status, notes, games, reviews }) => {
            if (!games) return null;
            const review = (reviews ?? [])[0] ?? null;
            const rating = review?.rating ?? null;
            return (
              <div key={id} className="group flex flex-col gap-1.5">

                {/* ── Cover area ─────────────────────────────────────────── */}
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">

                  {/* Cover image */}
                  <Link href={`/games/${games.slug}`} className="block h-full">
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
                  </Link>

                  {/* Rating — bottom right overlay */}
                  {rating != null && (
                    <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400" aria-hidden="true">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span className="text-[10px] font-medium text-yellow-400">{rating}</span>
                    </div>
                  )}

                  {/* Review bubble — bottom left overlay */}
                  {review && (
                    <Link
                      href={`/review/${review.id}`}
                      title="View review"
                      className="absolute bottom-1.5 left-1.5 z-10 flex items-center justify-center rounded-full bg-black/60 p-1 backdrop-blur-sm transition-colors hover:bg-black/80"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </Link>
                  )}
                </div>

                {/* Title */}
                <Link
                  href={`/games/${games.slug}`}
                  className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors group-hover:text-white"
                >
                  {games.title}
                </Link>

                {/* Status badge */}
                <span
                  className={`self-start rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.shelved}`}
                >
                  {formatStatus(status)}
                </span>

                {/* Notes preview — only visible on library page */}
                {notes && (
                  <p className="truncate text-xs italic text-white/40">
                    📝 &ldquo;{notes}&rdquo;
                  </p>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
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
