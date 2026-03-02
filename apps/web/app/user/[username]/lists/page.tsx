// apps/web/app/user/[username]/lists/page.tsx
// All lists for a user. Shows private lists too when viewing own profile.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { ListCard, ListRow } from "@/components/ListCard";


// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UserListsPage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = params;
  const supabase = await createClient();

  // Profile lookup
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as {
    id: string; username: string; display_name: string | null;
  } | null;
  if (!profile) notFound();

  // Fetch current user for ownership check
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === profile.id;

  // Fetch all visible lists with first-4 entry covers and like counts.
  // RLS on lists already filters to is_public=true for non-owners.
  const { data: rawLists } = await supabase
    .from("lists")
    .select(`
      id, title, is_ranked, is_public, created_at,
      list_entries(position, games(cover_url)),
      list_likes(id)
    `)
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const lists = (rawLists ?? []) as unknown as ListRow[];

  const displayName = profile.display_name ?? profile.username;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <Link
        href={`/user/${username}`}
        className="mb-8 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to profile
      </Link>

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-white">
            {displayName}&apos;s Lists
          </h1>
          <span className="text-sm text-zinc-500">
            {lists.length} {lists.length === 1 ? "list" : "lists"}
          </span>
        </div>
        {isOwnProfile && (
          <Link
            href="/lists/new"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            New List
          </Link>
        )}
      </div>

      {/* ── Lists grid ──────────────────────────────────────────────────────── */}
      {lists.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">
            {isOwnProfile ? "You haven't created any lists yet." : "No lists yet."}
          </p>
          {isOwnProfile && (
            <Link
              href="/lists/new"
              className="mt-3 inline-block text-sm text-violet-400 transition-colors hover:text-violet-300"
            >
              Create your first list →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} username={username} />
          ))}
        </div>
      )}

    </main>
  );
}

