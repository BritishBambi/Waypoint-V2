"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGameSearch, type GameSearchResult } from "@waypoint/api-client";

// ─── Debounce ─────────────────────────────────────────────────────────────────

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// ─── Search page ──────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [input, setInput] = useState("");
  const query = useDebounce(input, 400);
  const { results, isLoading, isError, error } = useGameSearch(query);

  const hasQuery = query.trim().length >= 3;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">

        {/* ── Search input ─────────────────────────────────────────────── */}
        <div className="relative mb-10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search for a game…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-4 pl-12 pr-4 text-lg text-white placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* ── States ───────────────────────────────────────────────────── */}
        {!hasQuery && <IdleState />}
        {hasQuery && isLoading && <SkeletonGrid />}
        {hasQuery && isError && <ErrorState error={error} />}
        {hasQuery && !isLoading && !isError && results.length === 0 && (
          <EmptyState query={query} />
        )}
        {hasQuery && !isLoading && !isError && results.length > 0 && (
          <ResultsGrid results={results} />
        )}

      </div>
    </main>
  );
}

// ─── Results grid ─────────────────────────────────────────────────────────────

function ResultsGrid({ results }: { results: GameSearchResult[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {results.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

// ─── Game card ────────────────────────────────────────────────────────────────

function GameCard({ game }: { game: GameSearchResult }) {
  const year = game.release_date ? game.release_date.slice(0, 4) : null;
  const genres = game.genres?.slice(0, 2) ?? [];

  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-all duration-200 hover:-translate-y-1 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/40"
    >
      {/* Cover image */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {game.cover_url ? (
          <Image
            src={game.cover_url}
            alt={game.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
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

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
          {game.title}
        </p>

        {year && (
          <p className="text-xs text-zinc-500">{year}</p>
        )}

        {genres.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-label="Loading results"
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
        >
          {/* Cover placeholder */}
          <div className="aspect-[2/3] w-full animate-pulse bg-zinc-800" />
          {/* Info placeholder */}
          <div className="flex flex-col gap-2 p-3">
            <div className="h-3 w-full animate-pulse rounded-full bg-zinc-800" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-zinc-800" />
            <div className="mt-1 h-3 w-1/3 animate-pulse rounded-full bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Idle / empty / error states ──────────────────────────────────────────────

function IdleState() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-zinc-900 p-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-zinc-500"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <p className="text-lg font-medium text-zinc-300">Search for a game</p>
      <p className="mt-1 text-sm text-zinc-500">
        Start typing — results appear after 3 characters
      </p>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-zinc-900 p-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-zinc-500"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M8 11h6M11 8v6" />
        </svg>
      </div>
      <p className="text-lg font-medium text-zinc-300">
        No results for &ldquo;{query}&rdquo;
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        Try a different title or check your spelling
      </p>
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : "Unknown error";

  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-red-500/10 p-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="text-lg font-medium text-zinc-300">Search failed</p>
      <p className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-mono text-xs text-red-400">
        {message}
      </p>
    </div>
  );
}
