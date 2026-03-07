"use client";

// Horizontal scrolling carousel for the Wishlist preview on the profile page.
// Cover art only — no rating or review overlays (wishlist games haven't been played).
// Shows a release date badge for games that haven't released yet.

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { igdbCover } from "@/lib/igdb";

export type WishlistItem = {
  id: string;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
    release_date: string | null;
  } | null;
};

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const suffix =
    day === 1 || day === 21 || day === 31 ? "st" :
    day === 2 || day === 22 ? "nd" :
    day === 3 || day === 23 ? "rd" : "th";
  return `${month} ${day}${suffix}`;
}

export function WishlistCarousel({ items }: { items: WishlistItem[] }) {
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

      {/* ── Clip wrapper ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="grid grid-flow-col gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ gridAutoColumns: "minmax(110px, 1fr)" }}
        >
          {items.map(({ id, games }) => {
            if (!games) return null;
            const isUnreleased =
              games.release_date != null &&
              new Date(games.release_date).getTime() > Date.now();
            return (
              <div key={id} className="group flex flex-col gap-1.5">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">
                  <Link href={`/games/${games.slug}`} className="block h-full">
                    {games.cover_url ? (
                      <Image
                        src={igdbCover(games.cover_url, "t_720p")!}
                        alt={games.title}
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 160px"
                        quality={90}
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <NoCover />
                    )}
                  </Link>

                  {/* Release date badge — only for upcoming games */}
                  {isUnreleased && games.release_date && (
                    <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
                      <span className="text-[10px] font-medium text-zinc-300">
                        {formatDateShort(games.release_date)}
                      </span>
                    </div>
                  )}
                </div>

                <Link
                  href={`/games/${games.slug}`}
                  className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors group-hover:text-white"
                >
                  {games.title}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right arrow ──────────────────────────────────────────────────────── */}
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
