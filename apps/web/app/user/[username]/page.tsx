// apps/web/app/user/[username]/page.tsx
// Server-rendered public profile page.
//
// Data fetched in parallel:
//   - profiles row (by username — 404 if missing)
//   - game_logs joined with games (for library + currently playing)
//   - reviews joined with games (for the reviews section)
//   - auth.getUser() (to detect the profile owner)
//
// All sections are static HTML — no client components needed here.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Tables } from "@waypoint/types";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { FollowButton } from "./FollowButton";
import { LibraryCarousel } from "./LibraryCarousel";
import { ListCard, ListRow } from "@/components/ListCard";

// ─── Join types ───────────────────────────────────────────────────────────────
// Supabase returns nested objects for FK joins. We define our own shapes and
// cast after fetching, since the generated DB types don't express join shapes.

type GameStub = {
  id: number;
  slug: string;
  title: string;
  cover_url: string | null;
};

type LogWithGame = {
  id: string;
  status: string;
  updated_at: string;
  games: GameStub | null;
};

type ReviewWithGame = {
  id: string;
  rating: number;
  body: string | null;
  published_at: string | null;
  games: GameStub | null;
};

type FavouriteSlot = {
  position: number;
  games: GameStub | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

// Fixed palette for generated avatars — consistent per username via hash.
const AVATAR_COLORS = [
  "bg-indigo-600",
  "bg-violet-600",
  "bg-teal-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-emerald-600",
  "bg-sky-600",
  "bg-pink-600",
];

// User-requested badge colours differ from the game-detail page —
// teal for Playing, violet for Played, amber for Wishlist, muted red for Dropped.
const STATUS_BADGE: Record<string, string> = {
  playing:  "bg-teal-500/20   text-teal-300   border-teal-500/40",
  played:   "bg-violet-500/20 text-violet-300 border-violet-500/40",
  wishlist: "bg-amber-500/20  text-amber-300  border-amber-500/40",
  dropped:  "bg-red-900/30    text-red-400    border-red-800/50",
  shelved:  "bg-zinc-700/30   text-zinc-400   border-zinc-700/50",
};

const STATUS_LABEL: Record<string, string> = {
  playing: "Playing", played: "Played", wishlist: "Wishlist",
  dropped: "Dropped", shelved: "Shelved",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UserProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = params;
  const supabase = await createClient();

  // ── 1. Profile lookup ───────────────────────────────────────────────────────
  // maybeSingle() returns null (no error) when no row matches, so we can
  // notFound() cleanly without a Supabase error polluting the response.
  // Explicit cast: @supabase/ssr 0.5.x loses the row type when the generated
  // Database type includes the __InternalSupabase marker (PostgrestVersion 14.1).
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as Tables<"profiles"> | null;

  if (!profile) notFound();

  // ── 2. Parallel data fetching ───────────────────────────────────────────────
  // Named result variables avoid TypeScript tuple-inference issues that arise
  // when mixing head:true count queries with data queries in one destructure.
  const [
    logsRes,
    reviewsRes,
    authRes,
    favsRes,
    followerRes,
    followingRes,
    listsCountRes,
    recentListsRes,
  ] =
    await Promise.all([
      supabase
        .from("game_logs")
        .select("id, status, updated_at, games(id, slug, title, cover_url)")
        .eq("user_id", profile.id)
        .order("updated_at", { ascending: false }),

      supabase
        .from("reviews")
        .select("id, rating, body, published_at, games(id, slug, title, cover_url)")
        .eq("user_id", profile.id)
        .eq("is_draft", false)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false }),

      supabase.auth.getUser(),

      supabase
        .from("favourite_games")
        .select("position, games(id, slug, title, cover_url)")
        .eq("user_id", profile.id)
        .order("position"),

      // Count of users following this profile.
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("followee_id", profile.id),

      // Count of lists owned by this user (only public for others)
      supabase
        .from("lists")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_public", true),

      // Fetch up to 3 recent public lists with first few covers
      supabase
        .from("lists")
        .select(`
          id, title, is_ranked, is_public, created_at,
          list_entries(position, games(cover_url)),
          list_likes(id)
        `)
        .eq("user_id", profile.id)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(3),

      // Count of users this profile follows.
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profile.id),
  ]);

  const rawLogs      = logsRes.data;
  const rawReviews   = reviewsRes.data;
  const { user }     = authRes.data;
  const rawFavourites = favsRes.data;
  const followerCount = followerRes.count ?? 0;
  const followingCount = followingRes.count ?? 0;
  const listsCount = listsCountRes.count ?? 0;

  const logs      = (rawLogs      ?? []) as unknown as LogWithGame[];
  const reviews   = (rawReviews   ?? []) as unknown as ReviewWithGame[];
  const favRows   = (rawFavourites ?? []) as unknown as FavouriteSlot[];
  const recentLists = (recentListsRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    is_ranked: boolean;
    is_public: boolean;
    created_at: string;
    list_entries: Array<{ position: number | null; games: { cover_url: string | null } | null }>;
    list_likes: Array<{ id: string }>;
  }>;

  // Build a 4-element array indexed by position (0 = position 1).
  const favouriteSlots: (GameStub | null)[] = [null, null, null, null];
  for (const row of favRows) {
    if (row.games && row.position >= 1 && row.position <= 4) {
      favouriteSlots[row.position - 1] = row.games;
    }
  }
  const hasFavourites = favouriteSlots.some(Boolean);

  // ── 3. Derived values ───────────────────────────────────────────────────────
  const currentlyPlaying = logs.filter((l) => l.status === "playing");
  const totalPlayed = logs.filter((l) => l.status === "played").length;
  const isOwnProfile = user?.id === profile.id;
  const displayName = profile.display_name ?? profile.username;

  // ── 4. Follow status (sequential — depends on isOwnProfile) ─────────────────
  // Only query when viewing someone else's profile while logged in.
  let isFollowing = false;
  if (user && !isOwnProfile) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("followee_id", profile.id)
      .maybeSingle();
    isFollowing = !!followRow;
  }

  // ── 4. Render ───────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-start gap-6 sm:flex-row sm:items-start">

        {/* Avatar — image if set, generated initial circle if not */}
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full sm:h-28 sm:w-28">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={displayName}
              fill
              sizes="112px"
              className="object-cover"
              priority
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center text-3xl font-bold text-white ${avatarBg(profile.username)}`}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name, username, bio, stats, edit button */}
        <div className="flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">{displayName}</h1>
              <p className="text-sm text-zinc-500">@{profile.username}</p>
            </div>

            {isOwnProfile ? (
              <Link
                href={`/user/${profile.username}/edit`}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Edit Profile
              </Link>
            ) : (
              <FollowButton
                profileId={profile.id}
                currentUserId={user?.id ?? null}
                initialIsFollowing={isFollowing}
              />
            )}
          </div>

          {profile.bio && (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-300">
              {profile.bio}
            </p>
          )}

          {/* Stats row */}
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <StatPill value={logs.length} label="Games Logged" />
            <div className="h-6 w-px bg-zinc-800" aria-hidden="true" />
            <StatPill value={totalPlayed} label="Played" />
            <div className="h-6 w-px bg-zinc-800" aria-hidden="true" />
            <StatPill value={reviews.length} label="Reviews" />
            <div className="h-6 w-px bg-zinc-800" aria-hidden="true" />
            <StatLinkPill
              value={listsCount}
              label="Lists"
              href={`/user/${profile.username}/lists`}
            />
            <div className="h-6 w-px bg-zinc-800" aria-hidden="true" />
            <StatLinkPill
              value={followerCount}
              label="Followers"
              href={`/user/${profile.username}/followers`}
            />
            <div className="h-6 w-px bg-zinc-800" aria-hidden="true" />
            <StatLinkPill
              value={followingCount}
              label="Following"
              href={`/user/${profile.username}/following`}
            />
          </div>
        </div>
      </section>

      {/* ── Favourite Games ──────────────────────────────────────────────────── */}
      {/* Hidden entirely when the profile has no favourites and it's not the owner */}
      {(hasFavourites || isOwnProfile) && (
        <section className="mt-10">
          <h2 className="mb-4 text-base font-semibold text-white">Favourite Games</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:w-fit">
            {favouriteSlots.map((game, i) =>
              game ? (
                // Filled slot — cover with title tooltip on hover
                <Link
                  key={game.id}
                  href={`/games/${game.slug}`}
                  className="group relative w-full lg:w-[220px] aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800"
                  title={game.title}
                >
                  {game.cover_url ? (
                    <Image
                      src={igdbCover(game.cover_url, "t_720p")!}
                      alt={game.title}
                      fill
                      sizes="(max-width: 1024px) 50vw, 220px"
                      quality={90}
                      className="object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <NoCover />
                  )}
                  {/* Title overlay on hover */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="line-clamp-2 text-[10px] font-medium leading-snug text-white">
                      {game.title}
                    </p>
                  </div>
                </Link>
              ) : isOwnProfile ? (
                // Empty slot on own profile — "+" link to edit
                <Link
                  key={`empty-${i}`}
                  href={`/user/${profile.username}/edit`}
                  className="flex aspect-[2/3] w-full lg:max-w-[220px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-800 transition-colors hover:border-zinc-600"
                  title="Add a favourite game"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-zinc-600"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </Link>
              ) : (
                // Empty slot on someone else's profile — muted placeholder
                <div
                  key={`empty-${i}`}
                  className="aspect-[2/3] w-full lg:max-w-[220px] rounded-lg border border-dashed border-zinc-800"
                  aria-hidden="true"
                />
              )
            )}
          </div>
        </section>
      )}

      {/* ── Currently Playing ────────────────────────────────────────────────── */}
      {/* Only rendered when the user has at least one game with status = playing */}
      {currentlyPlaying.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-base font-semibold text-white">
            Currently Playing
          </h2>

          {/* Horizontally scrollable row — shrink-0 prevents cards from collapsing */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {currentlyPlaying.map(({ id, games }) =>
              games ? (
                <Link key={id} href={`/games/${games.slug}`} className="group shrink-0">
                  <div className="relative aspect-[2/3] w-28 overflow-hidden rounded-lg bg-zinc-800">
                    {games.cover_url ? (
                      <Image
                        src={games.cover_url.replace(/\/t_[^/]+\//, "/t_720p/")}
                        alt={games.title}
                        fill
                        sizes="112px"
                        quality={90}
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <NoCover />
                    )}
                  </div>
                  <p className="mt-1.5 w-28 text-xs text-zinc-400 line-clamp-2 transition-colors group-hover:text-white">
                    {games.title}
                  </p>
                </Link>
              ) : null
            )}
          </div>
        </section>
      )}

      {/* ── Game Library ─────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Game Library</h2>
          {logs.length > 0 && (
            <Link
              href={`/user/${profile.username}/library`}
              className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              View all
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          )}
        </div>

        {logs.length === 0 ? (
          <EmptyLibrary isOwnProfile={isOwnProfile} />
        ) : (
          <LibraryCarousel items={logs} />
        )}
      </section>

      {/* ── Recent Lists ─────────────────────────────────────────────────────── */}
      {recentLists.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Lists</h2>
            <Link
              href={`/user/${profile.username}/lists`}
              className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              View all
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentLists.map((list) => (
              <ListCard key={list.id} list={list} username={profile.username} />
            ))}
          </div>
        </section>
      )}

      {/* ── Reviews ──────────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="mb-4 text-base font-semibold text-white">Reviews</h2>

        {reviews.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
            No reviews yet.
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>

    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Numeric stat with a label beneath it
function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-bold leading-none text-white">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

// Clickable stat that links to a sub-page (e.g. followers list)
function StatLinkPill({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link href={href} className="group">
      <p className="text-lg font-bold leading-none text-white transition-colors group-hover:text-violet-400">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 transition-colors group-hover:text-zinc-400">
        {label}
      </p>
    </Link>
  );
}

// Review card: small cover left, title + rating + body + date right
function ReviewCard({ review }: { review: ReviewWithGame }) {
  const { rating, body, published_at, games } = review;
  if (!games) return null;

  return (
    <Link
      href={`/games/${games.slug}`}
      className="group flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
    >
      {/* Small cover */}
      <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-md bg-zinc-800">
        {games.cover_url ? (
          <Image
            src={games.cover_url.replace(/\/t_[^/]+\//, "/t_720p/")}
            alt={games.title}
            fill
            sizes="48px"
            quality={90}
            className="object-cover"
          />
        ) : (
          <NoCover />
        )}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white transition-colors group-hover:text-indigo-300">
          {games.title}
        </p>

        {/* Star rating */}
        <div className="mt-1 flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-yellow-400"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span className="text-sm font-semibold text-white">{rating}</span>
          <span className="text-xs text-zinc-500">/5</span>
        </div>

        {/* Body — clamped to 3 lines */}
        {body && (
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400 line-clamp-3">
            {body}
          </p>
        )}

        {published_at && (
          <p className="mt-2 text-xs text-zinc-600">{formatDate(published_at)}</p>
        )}
      </div>
    </Link>
  );
}

// Empty state shown when a user has no game logs at all
function EmptyLibrary({ isOwnProfile }: { isOwnProfile: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/50 py-16 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-3 text-zinc-600"
        aria-hidden="true"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 12h4M8 10v4" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="18" cy="12" r="1" />
      </svg>
      <p className="text-sm font-medium text-zinc-300">Nothing logged yet</p>
      {isOwnProfile && (
        <Link
          href="/search"
          className="mt-3 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
        >
          Search for games to log →
        </Link>
      )}
    </div>
  );
}

// Placeholder for missing cover art
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
