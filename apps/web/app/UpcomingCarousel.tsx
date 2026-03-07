"use client";

// UpcomingCarousel — horizontal scrolling row for the "Coming Soon" section.
// Same structure as PopularCarousel but shows a release date pill instead of
// a star rating badge.

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { UpcomingGame } from "./page";

function formatReleaseDate(unix: number): string {
  const date = new Date(unix * 1000);
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
      ? "nd"
      : day === 3 || day === 23
      ? "rd"
      : "th";
  return `${month} ${day}${suffix}`;
}

export function UpcomingCarousel({ games }: { games: UpcomingGame[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }

  useEffect(() => {
    updateArrows();
  }, [games]);

  return (
    <div className="relative">

      {/* ── Left arrow ─────────────────────────────────────────────────────── */}
      {canScrollLeft && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -scrollRef.current.clientWidth, behavior: "smooth" })}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
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
        {games.map((game) => (
          <UpcomingGameCard key={game.id} game={game} />
        ))}
      </div>

      {/* ── Right arrow ────────────────────────────────────────────────────── */}
      {canScrollRight && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth, behavior: "smooth" })}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

    </div>
  );
}

// ─── UpcomingGameCard ─────────────────────────────────────────────────────────

function UpcomingGameCard({ game }: { game: UpcomingGame }) {
  const coverUrl = game.cover_url?.replace(/\/t_[^/]+\//, "/t_720p/") ?? null;
  const dateLabel = game.release_date_unix != null
    ? formatReleaseDate(game.release_date_unix)
    : null;

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
        {dateLabel && (
          <div className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="text-[10px] font-medium text-zinc-300">{dateLabel}</span>
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
