import Image from "next/image";
import Link from "next/link";

// Reusable card used on profile sections and lists index pages.
// Props mirror the shape returned by the database queries in the pages.

type Entry = {
  position: number | null;
  games: { cover_url: string | null } | null;
};

export type ListRow = {
  id: string;
  title: string;
  is_ranked: boolean;
  is_public: boolean;
  list_entries: Entry[];
  list_likes: Array<{ id: string }>;
};

interface ListCardProps {
  list: ListRow;
  username: string;
}

export function ListCard({ list, username }: ListCardProps) {
  // Sort entries by position (for ranked lists) and take first 4 covers
  const sortedEntries = [...list.list_entries].sort(
    (a, b) => (a.position ?? 9999) - (b.position ?? 9999)
  );
  const coverUrls = sortedEntries.slice(0, 4).map((e) => e.games?.cover_url ?? null);
  const gameCount = list.list_entries.length;
  const likeCount = list.list_likes.length;

  return (
    <Link
      href={`/user/${username}/lists/${list.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
    >
      {/* Stacked cover art */}
      <StackedCovers coverUrls={coverUrls} title={list.title} />

      {/* Title + badges */}
      <div>
        <div className="flex items-start gap-2">
          <p className="flex-1 font-semibold leading-snug text-white transition-colors group-hover:text-violet-300">
            {list.title}
          </p>
          {!list.is_public && (
            <span className="mt-0.5 shrink-0 rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">
              Private
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-500">
          <span>{gameCount} {gameCount === 1 ? "game" : "games"}</span>
          {list.is_ranked && <span className="text-amber-500/70">Ranked</span>}
          {likeCount > 0 && (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-rose-500/60" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function StackedCovers({
  coverUrls,
  title,
}: {
  coverUrls: (string | null)[];
  title: string;
}) {
  const filled = coverUrls.length > 0 ? coverUrls : [null];

  return (
    <div className="flex h-16 items-center">
      {filled.slice(0, 4).map((url, i) => (
        <div
          key={i}
          className={`relative aspect-[2/3] h-16 shrink-0 overflow-hidden rounded-md bg-zinc-800 ring-2 ring-zinc-900 ${i > 0 ? "-ml-2" : ""}`}
          style={{ zIndex: 4 - i }}
        >
          {url ? (
            <Image
              src={url}
              alt={title}
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
