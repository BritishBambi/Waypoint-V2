// Shown by Next.js while the game detail Server Component fetches from IGDB.
// Mirrors the real page layout: backdrop strip → cover + info hero.

export default function GameDetailLoading() {
  return (
    <main className="min-h-screen">
      {/* Backdrop skeleton */}
      <div className="mx-auto max-w-6xl px-4">
        <div className="h-[380px] rounded-b-sm bg-zinc-900 animate-pulse" />
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-10 mt-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">

          {/* Cover */}
          <div className="mx-auto shrink-0 md:mx-0">
            <div className="aspect-[2/3] w-[160px] md:w-[200px] rounded-xl bg-zinc-800 animate-pulse" />
          </div>

          {/* Info column */}
          <div className="flex flex-col gap-3 md:pt-10 flex-1">
            {/* Title */}
            <div className="h-9 w-2/3 rounded-lg bg-zinc-800 animate-pulse" />
            {/* Year · platforms */}
            <div className="h-4 w-1/3 rounded-full bg-zinc-800 animate-pulse" />
            {/* Genre pills */}
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-6 w-16 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-6 w-24 rounded-full bg-zinc-800 animate-pulse" />
            </div>
            {/* Summary lines */}
            <div className="space-y-2 mt-2">
              <div className="h-4 w-full rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-4 w-full rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-4 w-3/4 rounded-full bg-zinc-800 animate-pulse" />
            </div>
            {/* Log button */}
            <div className="h-10 w-36 rounded-lg bg-zinc-800 animate-pulse mt-2" />
          </div>
        </div>
      </section>
    </main>
  );
}
