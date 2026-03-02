"use client";

// Horizontal scrolling carousel for the Game Library preview on the profile page.
// Same scroll/arrow pattern as PopularCarousel. Arrows appear only when there is
// overflow — so for ≤4 games (which fit without scrolling) no controls are shown.

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { igdbCover } from "@/lib/igdb";

export type LibraryItem = {
  id: string;
  status: string;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
  } | null;
};

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

export function LibraryCarousel({ items }: { items: LibraryItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }

  useEffect(() => {
    updateArrows();
  }, [items]);

  return (
    <div className="relative">

      {/* ── Left arrow ─────────────────────────────────────────────────────── */}
      {canScrollLeft && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -scrollRef.current.clientWidth, behavior: "smooth" })}
          aria-label="Scroll left"
          className="absolute left-0 top-[38%] z-10 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* ── Scroll container ───────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ id, status, games }) =>
          games ? (
            <Link key={id} href={`/games/${games.slug}`} className="group shrink-0">
              <div className="relative aspect-[2/3] w-36 overflow-hidden rounded-lg bg-zinc-800">
                {games.cover_url ? (
                  <Image
                    src={igdbCover(games.cover_url, "t_720p")!}
                    alt={games.title}
                    fill
                    sizes="144px"
                    quality={90}
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <NoCover />
                )}
              </div>
              <div className="mt-1.5 w-36 space-y-1">
                <p className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors group-hover:text-white">
                  {games.title}
                </p>
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.shelved}`}>
                  {STATUS_LABEL[status] ?? status}
                </span>
              </div>
            </Link>
          ) : null
        )}
      </div>

      {/* ── Right arrow ────────────────────────────────────────────────────── */}
      {canScrollRight && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth, behavior: "smooth" })}
          aria-label="Scroll right"
          className="absolute right-0 top-[38%] z-10 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

    </div>
  );
}

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
