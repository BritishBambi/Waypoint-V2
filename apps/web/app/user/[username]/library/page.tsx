// apps/web/app/user/[username]/library/page.tsx
// Full game library for a user — all logged games sorted by release date (newest first).

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { LibraryGrid } from "./LibraryGrid";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogWithGame = {
  id: string;
  status: string;
  notes: string | null;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
    release_date: string | null;
  } | null;
  reviews: Array<{ id: string; rating: number | null }> | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: { username: string };
}

export default async function LibraryPage({ params }: Props) {
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

  const { data: { user } } = await supabase.auth.getUser();
  const isOwnLibrary = user?.id === profile.id;

  // Fetch library logs (excludes wishlist — wishlist has its own page).
  const { data: rawLogs } = await supabase
    .from("game_logs")
    .select("id, status, notes, games(id, slug, title, cover_url, release_date), reviews(id, rating)")
    .eq("user_id", profile.id)
    .neq("status", "wishlist");

  const logs = (rawLogs ?? []) as unknown as LogWithGame[];

  // Sort by game release_date descending (newest games first).
  // Games with no release_date sort to the end.
  logs.sort((a, b) => {
    const da = a.games?.release_date ?? "";
    const db = b.games?.release_date ?? "";
    return db.localeCompare(da);
  });

  // Fetch Steam playtime for own library.
  let steamPlaytime: Record<number, number> = {};
  if (isOwnLibrary) {
    const { data: rawProfile2 } = await supabase
      .from("profiles")
      .select("steam_id")
      .eq("id", profile.id)
      .maybeSingle();
    if ((rawProfile2 as any)?.steam_id) {
      const { data: steamRows } = await supabase
        .from("user_steam_data")
        .select("game_id, playtime_minutes")
        .eq("user_id", profile.id);
      for (const row of (steamRows ?? []) as Array<{ game_id: number | null; playtime_minutes: number }>) {
        if (row.game_id != null && row.playtime_minutes > 0) {
          steamPlaytime[row.game_id] = row.playtime_minutes;
        }
      }
    }
  }

  const displayName = profile.display_name ?? profile.username;

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
          {displayName}&apos;s Library
        </h1>
        <span className="text-sm text-zinc-500">
          {logs.length} {logs.length === 1 ? "game" : "games"}
        </span>
      </div>

      {/* ── Grid with status filters ─────────────────────────────────────────── */}
      {logs.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          No games logged yet.
        </p>
      ) : (
        <LibraryGrid logs={logs} isOwnLibrary={isOwnLibrary} userId={user?.id ?? null} steamPlaytime={steamPlaytime} />
      )}

    </main>
  );
}
