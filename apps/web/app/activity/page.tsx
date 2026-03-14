// apps/web/app/activity/page.tsx
// Full friend activity feed — all game logs from followed users, 30 per page.
// Auth-required: middleware redirects unauthenticated visitors to /login.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActivityFeed, type FeedItem } from "./ActivityFeed";

const PAGE_SIZE = 30;

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const followRes = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user.id);

  const followedIds = (
    (followRes.data ?? []) as Array<{ followee_id: string }>
  ).map((r) => r.followee_id);

  const isFollowingNobody = followedIds.length === 0;

  let initialItems: FeedItem[] = [];
  let totalCount = 0;

  if (!isFollowingNobody) {
    // Fetch first page and total count in parallel.
    const [feedRes, countRes] = await Promise.all([
      supabase
        .from("game_logs")
        .select(
          "id, status, created_at, updated_at, " +
            "games(id, slug, title, cover_url), " +
            "profiles(username, display_name, avatar_url, active_title:titles!active_title_id(name, color, steam_app_id, game:games(cover_url))), " +
            "reviews!log_id(rating)"
        )
        .in("user_id", followedIds)
        .neq("user_id", user.id)
        .in("status", ["playing", "played", "dropped"])
        .order("updated_at", { ascending: false })
        .limit(PAGE_SIZE),

      supabase
        .from("game_logs")
        .select("*", { count: "exact", head: true })
        .in("user_id", followedIds)
        .neq("user_id", user.id)
        .in("status", ["playing", "played", "dropped"]),
    ]);

    initialItems = (feedRes.data ?? []) as unknown as FeedItem[];
    totalCount   = countRes.count ?? 0;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <Link
        href="/"
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
        Home
      </Link>

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Friend Activity</h1>
        <p className="mt-1 text-sm text-zinc-500">
          What your friends have been playing
        </p>
      </div>

      {/* ── Feed or empty state ─────────────────────────────────────────────── */}
      {isFollowingNobody ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <p className="text-sm text-zinc-500">
            Follow some people to see their activity here.
          </p>
          <Link
            href="/search?tab=users"
            className="mt-3 inline-block text-sm text-violet-400 transition-colors hover:text-violet-300"
          >
            Find People →
          </Link>
        </div>
      ) : (
        <ActivityFeed
          initialItems={initialItems}
          followedIds={followedIds}
          userId={user.id}
          totalCount={totalCount}
        />
      )}

    </main>
  );
}
