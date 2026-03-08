// apps/web/app/user/[username]/stats/loading.tsx
// Skeleton shown while the SSR stats page is generating.

export default function StatsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* Breadcrumb placeholder */}
      <div className="mb-8 h-4 w-28 animate-pulse rounded bg-zinc-800" />

      {/* Heading placeholder */}
      <div className="mb-8 h-7 w-48 animate-pulse rounded bg-zinc-800" />

      {/* ── Top row: donut + two stat cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Donut card */}
        <div className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="h-[148px] w-[148px] animate-pulse rounded-full bg-zinc-800" />
          <div className="mt-3 w-full space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-zinc-700" />
                <div className="h-3 flex-1 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-6 shrink-0 animate-pulse rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>

        {/* Most Played placeholder */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 h-2.5 w-20 animate-pulse rounded bg-zinc-800" />
          <div className="mb-1 h-6 w-32 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-800" />
          <div className="mt-6 flex">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[120px] w-20 animate-pulse rounded-md bg-zinc-800"
                style={{ marginLeft: i > 1 ? "-24px" : 0 }}
              />
            ))}
          </div>
        </div>

        {/* Highest Rated placeholder */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 h-2.5 w-24 animate-pulse rounded bg-zinc-800" />
          <div className="mb-1 h-6 w-28 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-36 animate-pulse rounded bg-zinc-800" />
          <div className="mt-6 flex">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[120px] w-20 animate-pulse rounded-md bg-zinc-800"
                style={{ marginLeft: i > 1 ? "-24px" : 0 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── By Decade skeleton rows ──────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-3 h-2.5 w-16 animate-pulse rounded bg-zinc-800" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-start gap-4 border-t border-zinc-800 py-4"
          >
            {/* Label */}
            <div className="w-20 shrink-0 space-y-1.5">
              <div className="h-5 w-14 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-12 animate-pulse rounded bg-zinc-800" />
            </div>
            {/* Cover placeholders */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 - i }).map((_, j) => (
                <div key={j} className="h-[120px] w-20 animate-pulse rounded-sm bg-zinc-800" />
              ))}
            </div>
          </div>
        ))}
      </div>

    </main>
  );
}
