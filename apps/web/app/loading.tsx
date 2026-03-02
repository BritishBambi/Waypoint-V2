// Shown by Next.js while the homepage Server Component is fetching data.
// Approximates the logged-in layout (greeting + popular carousel + activity grid).

export default function HomeLoading() {
  return (
    <main className="min-h-screen">
      {/* Hero / greeting bar */}
      <div className="h-[600px] bg-zinc-900 animate-pulse" />

      <div className="mx-auto max-w-6xl px-4 py-10 space-y-10">
        {/* Section heading */}
        <div className="h-4 w-36 rounded-full bg-zinc-800 animate-pulse" />

        {/* Carousel row */}
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[180px] space-y-2">
              <div className="aspect-[2/3] rounded-xl bg-zinc-800 animate-pulse" />
              <div className="h-3 w-3/4 rounded-full bg-zinc-800 animate-pulse" />
              <div className="h-3 w-1/2 rounded-full bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Second section heading */}
        <div className="h-4 w-44 rounded-full bg-zinc-800 animate-pulse" />

        {/* Activity grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] rounded-lg bg-zinc-800 animate-pulse" />
              <div className="h-3 w-3/4 rounded-full bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
