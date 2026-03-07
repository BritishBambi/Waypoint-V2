// apps/web/app/user/[username]/lists/[id]/page.tsx
// List detail page — shows all games in a list, ranked or unranked.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { ListLikeButton } from "./ListLikeButton";
import { PinShowcaseButton } from "./PinShowcaseButton";

// ─── Types ────────────────────────────────────────────────────────────────────

type ListRow = {
  id: string;
  title: string;
  description: string | null;
  is_ranked: boolean;
  is_public: boolean;
  created_at: string;
  user_id: string;
};

type EntryWithGame = {
  id: string;
  position: number | null;
  note: string | null;
  games: {
    id: number;
    slug: string;
    title: string;
    cover_url: string | null;
    release_date: string | null;
  } | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ListDetailPage({
  params,
}: {
  params: { username: string; id: string };
}) {
  const { username, id } = params;
  const supabase = await createClient();

  // Profile lookup (include showcase columns to determine pin state)
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, showcase_list_1_id, showcase_list_2_id")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    showcase_list_1_id: string | null;
    showcase_list_2_id: string | null;
  } | null;
  if (!profile) notFound();

  // List lookup — must belong to this user
  const { data: rawList } = await supabase
    .from("lists")
    .select("id, title, description, is_ranked, is_public, created_at, user_id")
    .eq("id", id)
    .eq("user_id", profile.id)
    .maybeSingle();
  const list = rawList as ListRow | null;
  if (!list) notFound();

  // Entries + auth + likes in parallel
  const [entriesRes, authRes, likesRes] = await Promise.all([
    supabase
      .from("list_entries")
      .select("id, position, note, games(id, slug, title, cover_url, release_date)")
      .eq("list_id", id)
      .order("position", { ascending: true, nullsFirst: false }),

    supabase.auth.getUser(),

    supabase
      .from("list_likes")
      .select("id, user_id")
      .eq("list_id", id),
  ]);

  const entries   = (entriesRes.data ?? []) as unknown as EntryWithGame[];
  const { user }  = authRes.data;
  const likes     = (likesRes.data as Array<{ id: string; user_id: string }> ?? []);

  const isOwnProfile = user?.id === profile.id;
  const isLiked      = user ? likes.some((l) => l.user_id === user.id) : false;
  const likeCount    = likes.length;

  const pinState =
    profile.showcase_list_1_id === id ? "slot1" :
    profile.showcase_list_2_id === id ? "slot2" :
    "none";

  const displayName = profile.display_name ?? profile.username;
  const createdAt   = new Date(list.created_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <Link
        href={`/user/${username}/lists`}
        className="mb-8 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {displayName}&apos;s Lists
      </Link>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold leading-tight text-white">{list.title}</h1>
          {isOwnProfile && (
            <Link
              href={`/user/${username}/lists/${id}/edit`}
              className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Edit
            </Link>
          )}
        </div>

        {/* Creator + date */}
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold uppercase text-white">
              {displayName.charAt(0)}
            </div>
          )}
          <Link href={`/user/${username}`} className="text-zinc-400 transition-colors hover:text-white">
            {displayName}
          </Link>
          <span aria-hidden="true">·</span>
          <span>{createdAt}</span>
        </div>

        {/* Description */}
        {list.description && (
          <p className="mt-3 max-w-2xl italic leading-relaxed text-zinc-400">
            {list.description}
          </p>
        )}

        {/* Stats + actions row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-500">
            {entries.length} {entries.length === 1 ? "game" : "games"}
          </span>
          {list.is_ranked && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              Ranked
            </span>
          )}
          {!list.is_public && (
            <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
              Private
            </span>
          )}
          <ListLikeButton
            listId={id}
            currentUserId={user?.id ?? null}
            initialLikeCount={likeCount}
            initialIsLiked={isLiked}
          />
          {isOwnProfile && (
            <PinShowcaseButton
              listId={id}
              profileId={profile.id}
              initialPinState={pinState}
            />
          )}
        </div>
      </div>

      {/* ── Games ───────────────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          No games in this list yet.
          {isOwnProfile && (
            <Link
              href={`/user/${username}/lists/${id}/edit`}
              className="ml-1 text-violet-400 hover:text-violet-300"
            >
              Add some →
            </Link>
          )}
        </p>
      ) : list.is_ranked ? (
        <RankedList entries={entries} />
      ) : (
        <UnrankedGrid entries={entries} />
      )}

    </main>
  );
}

// ─── Ranked list layout ───────────────────────────────────────────────────────

function RankedList({ entries }: { entries: EntryWithGame[] }) {
  return (
    <ol className="space-y-3">
      {entries.map((entry, index) => {
        if (!entry.games) return null;
        const { games } = entry;
        const year = games.release_date ? games.release_date.slice(0, 4) : null;

        return (
          <li key={entry.id} className="flex items-start gap-4">
            {/* Rank number */}
            <span className="w-8 shrink-0 pt-2 text-right text-lg font-bold text-zinc-700">
              {index + 1}
            </span>

            {/* Cover */}
            <Link href={`/games/${games.slug}`} className="group shrink-0">
              <div className="relative aspect-[2/3] w-14 overflow-hidden rounded-lg bg-zinc-800 transition-transform duration-150 group-hover:scale-105">
                {games.cover_url ? (
                  <Image
                    src={igdbCover(games.cover_url, "t_cover_big")!}
                    alt={games.title}
                    fill
                    sizes="56px"
                    quality={85}
                    className="object-cover"
                  />
                ) : (
                  <NoCover />
                )}
              </div>
            </Link>

            {/* Title + year + note */}
            <div className="min-w-0 flex-1 pt-1">
              <Link
                href={`/games/${games.slug}`}
                className="font-semibold text-white transition-colors hover:text-violet-300"
              >
                {games.title}
              </Link>
              {year && <span className="ml-2 text-sm text-zinc-500">{year}</span>}
              {entry.note && (
                <p className="mt-1 text-sm italic leading-snug text-zinc-500">
                  &ldquo;{entry.note}&rdquo;
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Unranked grid layout ─────────────────────────────────────────────────────

function UnrankedGrid({ entries }: { entries: EntryWithGame[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {entries.map((entry) => {
        if (!entry.games) return null;
        const { games } = entry;

        return (
          <Link key={entry.id} href={`/games/${games.slug}`} className="group">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">
              {games.cover_url ? (
                <Image
                  src={igdbCover(games.cover_url, "t_720p")!}
                  alt={games.title}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
                  quality={85}
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <NoCover />
              )}
              {entry.note && (
                <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-3 text-[10px] italic leading-snug text-white">
                    {entry.note}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-400 transition-colors group-hover:text-white">
              {games.title}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NoCover() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-zinc-700"
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
