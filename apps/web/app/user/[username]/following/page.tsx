// apps/web/app/user/[username]/following/page.tsx
// Lists every user that this profile follows.
//
// Mirror of /followers — same structure, opposite FK direction:
//   follows WHERE follower_id = profile.id  →  followee IDs in recency order

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { FollowButton } from "../FollowButton";

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600",
];

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FollowingPage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = params;
  const supabase = await createClient();

  // ── 1. Profile lookup ───────────────────────────────────────────────────────
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as Pick<Tables<"profiles">, "id" | "username" | "display_name"> | null;

  if (!profile) notFound();

  // ── 2. Parallel: followee IDs + current viewer ───────────────────────────
  const [{ data: followRows }, { data: { user } }] = await Promise.all([
    supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", profile.id)
      .order("created_at", { ascending: false }),

    supabase.auth.getUser(),
  ]);

  // Explicit cast — @supabase/ssr 0.5.x loses row types with PostgrestVersion 14.1
  const followeeIds = (followRows as Array<{ followee_id: string }> ?? []).map(
    (r) => r.followee_id
  );

  // ── 3. Parallel: profile data + viewer's own follows ─────────────────────
  const [followeeProfiles, viewerFollowees] = await Promise.all([
    followeeIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", followeeIds)
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),

    user
      ? supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", user.id)
          .then(({ data }) =>
            new Set(
              (data as Array<{ followee_id: string }> ?? []).map((r) => r.followee_id)
            )
          )
      : Promise.resolve(new Set<string>()),
  ]);

  // Reorder profiles to match the recency order from followRows.
  const profileMap = new Map(
    (followeeProfiles as Tables<"profiles">[]).map((p) => [p.id, p])
  );
  const orderedFollowees = followeeIds
    .map((id) => profileMap.get(id))
    .filter((p): p is Tables<"profiles"> => p !== undefined);

  const displayName = profile.display_name ?? profile.username;

  // ── 4. Render ───────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">

      {/* Back link + heading */}
      <div className="mb-8">
        <Link
          href={`/user/${username}`}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← @{username}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">
          {displayName}&apos;s Following
        </h1>
        <p className="text-sm text-zinc-500">
          Following {orderedFollowees.length}{" "}
          {orderedFollowees.length === 1 ? "person" : "people"}
        </p>
      </div>

      {orderedFollowees.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          Not following anyone yet.
        </p>
      ) : (
        <div className="space-y-3">
          {orderedFollowees.map((p) => (
            <UserCard
              key={p.id}
              person={p}
              currentUserId={user?.id ?? null}
              isFollowing={(viewerFollowees as Set<string>).has(p.id)}
              isCurrentUser={user?.id === p.id}
            />
          ))}
        </div>
      )}

    </main>
  );
}

// ─── UserCard ─────────────────────────────────────────────────────────────────

function UserCard({
  person,
  currentUserId,
  isFollowing,
  isCurrentUser,
}: {
  person: Tables<"profiles">;
  currentUserId: string | null;
  isFollowing: boolean;
  isCurrentUser: boolean;
}) {
  const name = person.display_name ?? person.username;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">

      {/* Avatar */}
      <Link href={`/user/${person.username}`} className="shrink-0">
        {person.avatar_url ? (
          <div className="relative h-10 w-10 overflow-hidden rounded-full">
            <Image
              src={person.avatar_url}
              alt={name}
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
        ) : (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${avatarBg(person.username)}`}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>

      {/* Name + username */}
      <Link href={`/user/${person.username}`} className="min-w-0 flex-1">
        <p className="font-medium text-white transition-colors hover:text-violet-300">
          {name}
        </p>
        <p className="text-sm text-zinc-500">@{person.username}</p>
      </Link>

      {/* Follow button — hidden for the current viewer's own card */}
      {!isCurrentUser && (
        <FollowButton
          profileId={person.id}
          currentUserId={currentUserId}
          initialIsFollowing={isFollowing}
        />
      )}

    </div>
  );
}
