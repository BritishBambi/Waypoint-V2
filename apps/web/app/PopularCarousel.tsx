"use client";

// PopularCarousel — horizontal scrolling row for the "Popular Right Now" section.
// Arrow buttons provide previous/next navigation on desktop; touch-swipe works
// natively on mobile (arrows are hidden on small screens).

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { GameStub } from "./page";

export function PopularCarousel({ games }: { games: GameStub[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }

  // Measure after mount (and whenever the games list changes).
  useEffect(() => {
    updateArrows();
  }, [games]);

  function scrollLeft() {
    scrollRef.current?.scrollBy({ left: -scrollRef.current.clientWidth, behavior: "smooth" });
  }

  function scrollRight() {
    scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative">

      {/* ── Left arrow ─────────────────────────────────────────────────────── */}
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
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
        </button>
      )}

      {/* ── Scroll container ───────────────────────────────────────────────── */}
      {/* overflow-x-auto keeps native touch-swipe on mobile while JS controls
          scrollLeft on desktop. Scrollbar is hidden cross-browser via the
          [scrollbar-width:none] + webkit pseudo-element pair. */}
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {games.map((game) => (
          <PopularGameCard key={game.id} game={game} />
        ))}
      </div>

      {/* ── Right arrow ────────────────────────────────────────────────────── */}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

    </div>
  );
}

// ─── PopularGameCard ──────────────────────────────────────────────────────────

function PopularGameCard({ game }: { game: GameStub }) {
  const coverUrl = game.cover_url?.replace(/\/t_[^/]+\//, "/t_720p/") ?? null;
  const score =
    game.igdb_rating != null ? (game.igdb_rating / 20).toFixed(1) : null;

  return (
    <Link href={`/games/${game.slug}`} className="group shrink-0">
      <div className="relative aspect-[2/3] w-32 overflow-hidden rounded-lg bg-zinc-800">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={game.title}
            fill
            sizes="(max-width: 768px) 40vw, 15vw"
            quality={90}
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <NoCover />
        )}
        {score && (
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
            <span className="text-[10px] font-medium text-yellow-400">{score}</span>
          </div>
        )}
      </div>
      <p className="mt-1.5 w-32 line-clamp-1 text-xs text-zinc-400 transition-colors group-hover:text-white">
        {game.title}
      </p>
    </Link>
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
