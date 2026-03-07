// apps/web/app/user/[username]/wishlist/page.tsx
// Full wishlist page — all wishlisted games sorted by date added (newest first).

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";

// ─── Types ────────────────────────────────────────────────────────────────────

type WishlistEntry = {
  id: string;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
    release_date: string | null;
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: { username: string };
}

export default async function WishlistPage({ params }: Props) {
  const { username } = params;
  const supabase = await createClient();

  // Profile lookup — 404 if username doesn't exist.
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as Pick<Tables<"profiles">, "id" | "username" | "display_name"> | null;

  if (!profile) notFound();

  // Fetch all wishlist entries sorted by created_at descending.
  const { data: rawEntries } = await supabase
    .from("game_logs")
    .select("id, games(id, slug, title, cover_url, release_date)")
    .eq("user_id", profile.id)
    .eq("status", "wishlist")
    .order("created_at", { ascending: false });

  const entries = (rawEntries ?? []) as unknown as WishlistEntry[];
  const displayName = profile.display_name ?? profile.username;
  const now = Date.now();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* ── Breadcrumb ────────────────────────────────────────────────────────── */}
      <Link
        href={`/user/${username}`}
        className="mb-8 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
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
        Back to profile
      </Link>

      {/* ── Heading + count ──────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-white">
          {displayName}&apos;s Wishlist
        </h1>
        <span className="text-sm text-zinc-500">
          {entries.length} {entries.length === 1 ? "game" : "games"}
        </span>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          No games wishlisted yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {entries.map(({ id, games }) => {
            if (!games) return null;
            const isUnreleased =
              games.release_date != null &&
              new Date(games.release_date).getTime() > now;
            return (
              <div key={id} className="group flex flex-col gap-1.5">

                {/* Cover area */}
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">
                  <Link href={`/games/${games.slug}`} className="block h-full">
                    {games.cover_url ? (
                      <Image
                        src={igdbCover(games.cover_url, "t_720p")!}
                        alt={games.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                        quality={90}
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <NoCover />
                    )}
                  </Link>

                  {/* Release date badge — upcoming games only */}
                  {isUnreleased && games.release_date && (
                    <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
                      <span className="text-[10px] font-medium text-zinc-300">
                        {formatDateShort(games.release_date)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Title */}
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
      )}

    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
