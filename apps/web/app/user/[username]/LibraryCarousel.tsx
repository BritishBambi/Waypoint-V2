"use client";

// Horizontal scrolling carousel for the Game Library preview on the profile page.
// Cards fill the full container width using a CSS grid with minmax auto-columns:
//   - ≤ N cards: each card expands to fill the container (no dead space at right)
//   - > N cards: each card is at minimum 110px wide and the row scrolls
// Arrows appear only when there is overflow.

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { igdbCover } from "@/lib/igdb";
import { formatStatus } from "@/lib/formatStatus";

export type LibraryItem = {
  id: string;
  status: string;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
  } | null;
  reviews: Array<{ id: string; rating: number | null }>;
};

const STATUS_BADGE: Record<string, string> = {
  playing:  "bg-teal-500/20   text-teal-300   border-teal-500/40",
  played:   "bg-violet-500/20 text-violet-300 border-violet-500/40",
  dropped:  "bg-red-900/30    text-red-400    border-red-800/50",
  backlog:  "bg-sky-500/20    text-sky-300    border-sky-500/40",
  shelved:  "bg-zinc-700/30   text-zinc-400   border-zinc-700/50",
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

      {/* ── Clip wrapper — prevents partial cards peeking at the right edge ── */}
      <div className="overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className="grid grid-flow-col gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ gridAutoColumns: "minmax(110px, 1fr)" }}
        >
          {items.map(({ id, status, games, reviews = [] }) => {
            if (!games) return null;
            const review = reviews[0] ?? null;
            const rating = review?.rating ?? null;
            return (
              <div key={id} className="group flex flex-col gap-1.5">

                {/* ── Cover area ─────────────────────────────────────────── */}
                {/* overflow-hidden lives here so absolute overlays clip correctly */}
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">

                  {/* Cover image */}
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
                      onClick={(e) => e.stopPropagation()}
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

                {/* Status badge — self-start prevents flex-stretch to full width */}
                <span className={`self-start rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.shelved}`}>
                  {formatStatus(status)}
                </span>

              </div>
            );
          })}
        </div>
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
