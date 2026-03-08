// GenreStatsSection.tsx
// Server component — no "use client" needed. All rendering is static SVG/HTML.
// Shown on user profiles below the stats bar, above Favourite Games.

import Image from "next/image";
import Link from "next/link";
import { igdbCover } from "@/lib/igdb";

// ─── Exported types (consumed by page.tsx for computation) ────────────────────

export type GenreSlice = {
  genre: string;
  count: number;
  percentage: number; // Math.round(count / totalLogged * 100)
  covers: string[];   // up to 3 cover URLs
};

export type DecadeData = {
  decade: number;  // e.g. 1990
  count: number;
  games: Array<{ cover_url: string | null; slug: string }>; // up to 10, newest first
};

export type GenreStatsData = {
  totalLogged: number;
  genreSlices: GenreSlice[];  // top 5 genres + optional "Other" slice
  mostPlayed: GenreSlice | null;
  highestRated: { genre: string; avgRating: number; covers: string[] } | null;
  decades: DecadeData[];
};

// ─── Donut palette ────────────────────────────────────────────────────────────

const DONUT_COLORS = [
  "#7C3AED", // violet-600  — 1st genre
  "#9F67F5", // violet-400  — 2nd genre
  "#B794F4", // purple-300  — 3rd genre
  "#6D28D9", // violet-700  — 4th genre
  "#4C1D95", // violet-900  — 5th genre
  "#374151", // gray-700    — "Other"
];

// ─── Main component ───────────────────────────────────────────────────────────

export function GenreStatsSection({ data }: { data: GenreStatsData }) {
  const { totalLogged, genreSlices, mostPlayed, highestRated, decades } = data;

  // Require at least a donut or a decades row before rendering anything.
  if (genreSlices.length === 0 && decades.length === 0) return null;

  // How many cards exist for the top row?
  const hasDonut   = genreSlices.length > 0;
  const hasMost    = mostPlayed !== null;
  const hasRated   = highestRated !== null;
  const topRowCols = [hasDonut, hasMost, hasRated].filter(Boolean).length;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-base font-semibold text-white">Genre Stats</h2>

      {/* ── Row 1: Donut | Most Played | Highest Rated ──────────────────────── */}
      {topRowCols > 0 && (
        <div
          className={`grid gap-4 ${
            topRowCols === 3 ? "grid-cols-1 sm:grid-cols-3" :
            topRowCols === 2 ? "grid-cols-1 sm:grid-cols-2" :
            "grid-cols-1 sm:max-w-xs"
          }`}
        >
          {/* Donut chart card */}
          {hasDonut && (
            <div className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <DonutChart slices={genreSlices} totalLogged={totalLogged} />
              {/* Legend — top 5 only, no "Other" */}
              <div className="mt-3 w-full space-y-1.5">
                {genreSlices
                  .filter((s) => s.genre !== "Other")
                  .slice(0, 5)
                  .map((slice, i) => (
                    <div key={slice.genre} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[i] ?? "#374151" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                        {slice.genre}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-600">
                        {slice.percentage}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Most Played Genre */}
          {hasMost && mostPlayed && (
            <GenreCard
              label="Most Played"
              genre={mostPlayed.genre}
              stat={`${mostPlayed.percentage}% of your library`}
              covers={mostPlayed.covers}
            />
          )}

          {/* Highest Rated Genre */}
          {hasRated && highestRated && (
            <GenreCard
              label="Highest Rated"
              genre={highestRated.genre}
              stat={`★ ${highestRated.avgRating.toFixed(1)} avg rating`}
              covers={highestRated.covers}
            />
          )}
        </div>
      )}

      {/* ── Row 2: By Decade ─────────────────────────────────────────────────── */}
      {decades.length > 0 && (
        <div className="mt-6">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            By Decade
          </p>
          <div>
            {decades.map((d) => (
              <DecadeRow key={d.decade} data={d} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Donut SVG chart ──────────────────────────────────────────────────────────

function DonutChart({
  slices,
  totalLogged,
}: {
  slices: GenreSlice[];
  totalLogged: number;
}) {
  const cx = 80;
  const cy = 80;
  const r = 58;
  const strokeWidth = 20;
  const C = 2 * Math.PI * r; // circumference

  const total = slices.reduce((sum, s) => sum + s.count, 0);
  let accumulated = 0;

  return (
    <svg
      viewBox="0 0 160 160"
      width="148"
      height="148"
      role="img"
      aria-label="Genre distribution"
    >
      {/* Background track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#27272a"
        strokeWidth={strokeWidth}
      />

      {/* Slices — stacked circles with dasharray + dashoffset */}
      {slices.map((slice, i) => {
        const fraction = slice.count / total;
        const dash     = fraction * C;
        const offset   = -accumulated * C; // negative = advance clockwise
        accumulated += fraction;

        return (
          <circle
            key={slice.genre}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={DONUT_COLORS[i] ?? "#374151"}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: `${cx}px ${cy}px`,
            }}
          />
        );
      })}

      {/* Centre: total game count */}
      <text
        x={cx} y={cy - 6}
        textAnchor="middle"
        fill="white"
        fontSize="22"
        fontWeight="bold"
      >
        {totalLogged}
      </text>
      <text
        x={cx} y={cy + 12}
        textAnchor="middle"
        fill="#71717a"
        fontSize="10"
      >
        games
      </text>
    </svg>
  );
}

// ─── Genre stat card (Most Played / Highest Rated) ────────────────────────────

function GenreCard({
  label,
  genre,
  stat,
  covers,
}: {
  label: string;
  genre: string;
  stat: string;
  covers: string[];
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {label}
        </p>
        <p className="text-xl font-bold leading-tight text-white">{genre}</p>
        <p className="mt-1 text-sm text-zinc-400">{stat}</p>
      </div>

      {covers.length > 0 && (
        <div className="mt-4 flex items-end">
          {covers.slice(0, 3).map((url, i) => (
            <div
              key={i}
              className={`relative h-[120px] w-20 shrink-0 overflow-hidden rounded-md bg-zinc-800${i > 0 ? " -ml-6" : ""}`}
              style={{ zIndex: covers.length - i }}
            >
              <Image
                src={igdbCover(url, "t_cover_big")!}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Decade row (Letterboxd-style vertical layout) ────────────────────────────

function DecadeRow({ data }: { data: DecadeData }) {
  const { decade, count, games } = data;

  return (
    <div className="flex items-start gap-4 border-t border-zinc-800 py-4">
      {/* Left — fixed-width label */}
      <div className="w-20 shrink-0">
        <p className="text-lg font-bold leading-none text-white">{decade}s</p>
        <p className="mt-1 text-xs text-zinc-500">
          {count} {count === 1 ? "game" : "games"}
        </p>
      </div>

      {/* Right — wrapping cover grid, up to 10 covers */}
      <div className="flex flex-wrap gap-2">
        {games.map((game, i) => {
          const src = game.cover_url ? igdbCover(game.cover_url, "t_cover_big") : null;
          return (
            <Link
              key={i}
              href={`/games/${game.slug}`}
              className="group relative h-[120px] w-20 shrink-0 overflow-hidden rounded-sm bg-zinc-800"
            >
              {src ? (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover transition-opacity group-hover:opacity-75"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
