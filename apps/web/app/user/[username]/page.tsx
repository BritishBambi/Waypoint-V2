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
import { WishlistCarousel, type WishlistItem } from "./WishlistCarousel";
import { ListCard } from "@/components/ListCard";
import { SpoilerReveal } from "./SpoilerReveal";
import { GenreStatsSection, type GenreSlice, type DecadeData, type GenreStatsData } from "./GenreStatsSection";

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
  reviews: Array<{ id: string; rating: number | null }>;
};

type ReviewWithGame = {
  id: string;
  rating: number;
  body: string | null;
  is_spoiler: boolean;
  published_at: string | null;
  games: GameStub | null;
};

type FeaturedReview = {
  id: string;
  rating: number;
  body: string | null;
  is_spoiler: boolean;
  games: (GameStub & { release_date: string | null }) | null;
};

type FavouriteSlot = {
  position: number;
  games: GameStub | null;
};

type ShowcaseListData = {
  id: string;
  title: string;
  description: string | null;
  list_entries: Array<{ games: { cover_url: string | null } | null }>;
  list_likes: Array<{ id: string }>;
};

type LogGenreData = {
  game_id: number | null;
  games: {
    genres: string[] | null;
    release_date: string | null;
    cover_url: string | null;
  } | null;
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

  // ── Showcase fields ──────────────────────────────────────────────────────────
  const showcaseType    = (profile as any).showcase_type    as "review" | "list" | null;
  const showcaseList1Id = (profile as any).showcase_list_1_id as string | null;
  const showcaseList2Id = (profile as any).showcase_list_2_id as string | null;

  // ── 2. Parallel data fetching ───────────────────────────────────────────────
  // Named result variables avoid TypeScript tuple-inference issues that arise
  // when mixing head:true count queries with data queries in one destructure.
  const [
    logsRes,
    wishlistRes,
    reviewsRes,
    authRes,
    favsRes,
    followerRes,
    publicListsCountRes,
    recentListsRes,
    followingRes,
    showcaseList1Res,
    showcaseList2Res,
    genreDataRes,
  ] =
    await Promise.all([
      supabase
        .from("game_logs")
        .select("id, status, updated_at, games(id, slug, title, cover_url)")
        .eq("user_id", profile.id)
        .neq("status", "wishlist")
        .order("updated_at", { ascending: false }),

      supabase
        .from("game_logs")
        .select("id, games(id, slug, title, cover_url, release_date)")
        .eq("user_id", profile.id)
        .eq("status", "wishlist")
        .order("created_at", { ascending: false })
        .limit(12),

      supabase
        .from("reviews")
        .select("id, rating, body, is_spoiler, published_at, games(id, slug, title, cover_url)")
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

      // Public lists count (used when viewer is not the owner).
      supabase
        .from("lists")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_public", true),

      // Fetch up to 3 recent public lists with first few covers.
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

      // Showcase list 1 — only fetched when showcase_type is 'list'.
      showcaseType === "list" && showcaseList1Id
        ? supabase
            .from("lists")
            .select("id, title, description, list_entries(games(cover_url)), list_likes(id)")
            .eq("id", showcaseList1Id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Showcase list 2 — only fetched when showcase_type is 'list'.
      showcaseType === "list" && showcaseList2Id
        ? supabase
            .from("lists")
            .select("id, title, description, list_entries(games(cover_url)), list_likes(id)")
            .eq("id", showcaseList2Id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Genre stats — game genres + release dates for all non-wishlist logs.
      supabase
        .from("game_logs")
        .select("game_id, games(genres, release_date, cover_url)")
        .eq("user_id", profile.id)
        .neq("status", "wishlist"),
  ]);

  const rawLogs      = logsRes.data;
  const rawReviews   = reviewsRes.data;
  const { user }     = authRes.data;
  const rawFavourites = favsRes.data;
  const followerCount = followerRes.count ?? 0;
  const followingCount = followingRes.count ?? 0;
  const wishlistItems = (wishlistRes.data ?? []) as unknown as WishlistItem[];
  // we'll compute the final lists count after checking ownership
  let listsCount = publicListsCountRes.count ?? 0;

  const reviews   = (rawReviews   ?? []) as unknown as ReviewWithGame[];

  // Build a lookup from game_id → { id, rating } using the already-fetched
  // published reviews. This avoids relying on the embedded PostgREST join
  // (which is subject to RLS using the viewer's session, not the owner's)
  // and reuses data we already have in memory.
  const reviewByGameId = new Map<number, { id: string; rating: number }>();
  for (const r of reviews) {
    const gameId = (r.games as any)?.id as number | undefined;
    if (gameId) reviewByGameId.set(gameId, { id: r.id, rating: r.rating });
  }

  // Merge review data into each log by matching game_id.
  const logs: LogWithGame[] = ((rawLogs ?? []) as any[]).map((log: any) => {
    const gameId = (log.games as any)?.id as number | undefined;
    const review = gameId ? reviewByGameId.get(gameId) : undefined;
    return {
      ...log,
      reviews: review ? [review] : [],
    };
  });
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
  const showcaseList1 = (showcaseList1Res as any).data as ShowcaseListData | null;
  const showcaseList2 = (showcaseList2Res as any).data as ShowcaseListData | null;
  const genreData = (genreDataRes.data ?? []) as unknown as LogGenreData[];

  // ── Genre stats computation ──────────────────────────────────────────────────
  // Build a map from game_id → { genres, release_date, cover_url }.
  const genreGameMap = new Map<number, { genres: string[]; release_date: string | null; cover_url: string | null }>();
  for (const log of genreData) {
    if (log.game_id != null && log.games) {
      genreGameMap.set(log.game_id, {
        genres: log.games.genres ?? [],
        release_date: log.games.release_date,
        cover_url: log.games.cover_url,
      });
    }
  }

  // Genre → { count, covers }
  const genreMap = new Map<string, { count: number; covers: string[] }>();
  for (const game of genreGameMap.values()) {
    for (const genre of game.genres) {
      const entry = genreMap.get(genre) ?? { count: 0, covers: [] };
      entry.count++;
      if (entry.covers.length < 3 && game.cover_url) entry.covers.push(game.cover_url);
      genreMap.set(genre, entry);
    }
  }

  const sortedGenres = [...genreMap.entries()].sort((a, b) => b[1].count - a[1].count);
  const top5 = sortedGenres.slice(0, 5);
  const restCount = sortedGenres.slice(5).reduce((sum, [, g]) => sum + g.count, 0);

  const totalLoggedForGenres = logs.length;
  const genreSlices: GenreSlice[] = top5.map(([genre, { count, covers }]) => ({
    genre,
    count,
    percentage: totalLoggedForGenres > 0 ? Math.round((count / totalLoggedForGenres) * 100) : 0,
    covers,
  }));
  if (restCount > 0) {
    genreSlices.push({
      genre: "Other",
      count: restCount,
      percentage: Math.round((restCount / totalLoggedForGenres) * 100),
      covers: [],
    });
  }

  // Highest rated genre — needs ≥ 3 rated reviews per genre.
  const genreRatings = new Map<string, number[]>();
  for (const review of reviews) {
    const gameId = (review.games as any)?.id as number | undefined;
    if (!gameId || !review.rating) continue;
    const gameGenres = genreGameMap.get(gameId)?.genres ?? [];
    for (const genre of gameGenres) {
      const arr = genreRatings.get(genre) ?? [];
      arr.push(review.rating);
      genreRatings.set(genre, arr);
    }
  }
  let highestRated: GenreStatsData["highestRated"] = null;
  let bestAvg = 0;
  for (const [genre, ratings] of genreRatings) {
    if (ratings.length < 3) continue;
    const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      highestRated = { genre, avgRating: avg, covers: genreMap.get(genre)?.covers ?? [] };
    }
  }

  // Decades — bucket release years into decades, sort chronologically.
  const decadeMap = new Map<number, { count: number; covers: string[] }>();
  for (const game of genreGameMap.values()) {
    if (!game.release_date) continue;
    const year = new Date(game.release_date).getUTCFullYear();
    const decade = Math.floor(year / 10) * 10;
    const entry = decadeMap.get(decade) ?? { count: 0, covers: [] };
    entry.count++;
    if (entry.covers.length < 3 && game.cover_url) entry.covers.push(game.cover_url);
    decadeMap.set(decade, entry);
  }
  const decades: DecadeData[] = [...decadeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, { count, covers }]) => ({ decade, count, covers }));

  const showGenreStats = logs.length >= 3 && (genreSlices.length > 0 || decades.length > 0);
  const genreStatsData: GenreStatsData = {
    totalLogged: totalLoggedForGenres,
    genreSlices,
    mostPlayed: genreSlices.find((s) => s.genre !== "Other") ?? null,
    highestRated,
    decades,
  };

  // ── Featured review (showcase) — only fetch if showcase is set to 'review' ──
  const featuredReviewId = (profile as any).featured_review_id as string | null;
  let featuredReview: FeaturedReview | null = null;
  if (showcaseType === "review" && featuredReviewId) {
    const { data: rawFeatured } = await supabase
      .from("reviews")
      .select("id, rating, body, is_spoiler, games(id, slug, title, cover_url, release_date)")
      .eq("id", featuredReviewId)
      .eq("is_draft", false)
      .maybeSingle();
    featuredReview = rawFeatured as unknown as FeaturedReview | null;
  }

  // Build a 5-element array indexed by position (0 = position 1).
  const favouriteSlots: (GameStub | null)[] = [null, null, null, null, null];
  for (const row of favRows) {
    if (row.games && row.position >= 1 && row.position <= 5) {
      favouriteSlots[row.position - 1] = row.games;
    }
  }
  const hasFavourites = favouriteSlots.some(Boolean);

  // ── 3. Derived values ───────────────────────────────────────────────────────
  const currentlyPlaying = logs.filter((l) => l.status === "playing");
  const isOwnProfile = user?.id === profile.id;

  // if we're looking at our own profile, count *all* lists rather than just
  // the public ones that we fetched in the parallel block above.
  if (isOwnProfile) {
    const { count } = await supabase
      .from("lists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    listsCount = count ?? 0;
  }
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
          <div className="mt-4 flex w-full items-center justify-between">
            <div className="flex items-center gap-6">
              <StatPill value={logs.length} label="Games Logged" />
              <div className="h-6 w-px bg-zinc-800" aria-hidden="true" />
              <StatLinkPill
                value={listsCount}
                label="Lists"
                href={`/user/${profile.username}/lists`}
              />
            </div>
            <div className="flex items-center gap-6">
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
        </div>
      </section>

      {/* ── Genre Stats ──────────────────────────────────────────────────────── */}
      {showGenreStats && <GenreStatsSection data={genreStatsData} />}

      {/* ── Favourite Games ──────────────────────────────────────────────────── */}
      {/* Hidden entirely when the profile has no favourites and it's not the owner */}
      {(hasFavourites || isOwnProfile) && (
        <section className="mt-10">
          <h2 className="mb-4 text-base font-semibold text-white">Favourite Games</h2>
          <div className="grid grid-cols-5 gap-3">
            {favouriteSlots.map((game, i) =>
              game ? (
                // Filled slot — cover with title tooltip on hover
                <Link
                  key={game.id}
                  href={`/games/${game.slug}`}
                  className="group relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800"
                  title={game.title}
                >
                  {game.cover_url ? (
                    <Image
                      src={igdbCover(game.cover_url, "t_720p")!}
                      alt={game.title}
                      fill
                      sizes="(max-width: 640px) 20vw, (max-width: 1280px) 20vw, 200px"
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
                  className="flex aspect-[2/3] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-800 transition-colors hover:border-zinc-600"
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
                  className="aspect-[2/3] rounded-lg border border-dashed border-zinc-800"
                  aria-hidden="true"
                />
              )
            )}
          </div>
        </section>
      )}

      {/* ── Showcase ─────────────────────────────────────────────────────────── */}
      {showcaseType === "review" && featuredReview && (
        <section className="mt-10">
          <h2 className="mb-4 text-base font-semibold text-white">Review Showcase</h2>
          <ShowcaseCard review={featuredReview} />
        </section>
      )}

      {showcaseType === "list" && (showcaseList1 || showcaseList2) && (
        <section className="mt-10">
          <h2 className="mb-4 text-base font-semibold text-white">List Showcase</h2>
          <div className={`grid gap-4 ${showcaseList1 && showcaseList2 ? "grid-cols-2" : "grid-cols-1 sm:max-w-xs"}`}>
            {showcaseList1 && (
              <ShowcaseListCard list={showcaseList1} username={profile.username} />
            )}
            {showcaseList2 && (
              <ShowcaseListCard list={showcaseList2} username={profile.username} />
            )}
          </div>
        </section>
      )}

      {!showcaseType && isOwnProfile && (
        <section className="mt-10">
          <Link
            href={`/user/${profile.username}/edit`}
            className="flex items-center gap-3 rounded-xl border-2 border-dashed border-zinc-800 p-5 transition-colors hover:border-zinc-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="shrink-0 text-zinc-600"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <div>
              <p className="text-sm font-medium text-zinc-400">Add a Showcase</p>
              <p className="text-xs text-zinc-600">Pin a review or list to the top of your profile</p>
            </div>
          </Link>
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

      {/* ── Wishlist ──────────────────────────────────────────────────────────── */}
      {wishlistItems.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Wishlist</h2>
            <Link
              href={`/user/${profile.username}/wishlist`}
              className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              View all
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>
          <WishlistCarousel items={wishlistItems} />
        </section>
      )}

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
  const { id, rating, body, is_spoiler, published_at, games } = review;
  if (!games) return null;

  return (
    <Link
      href={`/review/${id}`}
      className="block cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-white/20 hover:bg-white/5"
    >
      <div className="flex gap-4">
        {/* Cover — visual only; whole card is the link */}
        <div className="shrink-0">
          <div className="relative h-[72px] w-12 overflow-hidden rounded-md bg-zinc-800">
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
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white">{games.title}</p>

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

          {/* Body — static spoiler notice or plain text (interactive reveal is on the review page) */}
          {body && is_spoiler ? (
            <p className="mt-1.5 text-sm text-zinc-500 italic">⚠ Contains spoilers — click to read</p>
          ) : body ? (
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400 line-clamp-3">
              {body}
            </p>
          ) : null}

          {published_at && (
            <p className="mt-2 text-xs text-zinc-600">{formatDate(published_at)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// Showcase / featured review card — prominent single card with "✦ Showcase" badge
function ShowcaseCard({ review }: { review: FeaturedReview }) {
  const { id, rating, body, is_spoiler, games } = review;
  if (!games) return null;
  const year = games.release_date ? games.release_date.slice(0, 4) : null;
  const truncated = body && body.length > 300 ? body.slice(0, 300) + "…" : body;

  return (
    <div className="relative flex gap-5 rounded-xl border border-violet-500/20 bg-zinc-900 p-5">
      {/* ✦ Showcase badge */}
      <span className="absolute right-4 top-4 text-xs font-medium text-violet-400">✦ Showcase</span>

      {/* Cover */}
      <Link href={`/games/${games.slug}`} className="group shrink-0">
        <div className="relative h-20 w-[53px] overflow-hidden rounded-md bg-zinc-800">
          {games.cover_url ? (
            <Image
              src={games.cover_url.replace(/\/t_[^/]+\//, "/t_720p/")}
              alt={games.title}
              fill
              sizes="53px"
              quality={90}
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <NoCover />
          )}
        </div>
      </Link>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <Link
            href={`/games/${games.slug}`}
            className="font-semibold text-white transition-colors hover:text-indigo-300"
          >
            {games.title}
          </Link>
          {year && <span className="text-sm text-zinc-500">{year}</span>}
        </div>

        {/* Star rating */}
        <div className="mb-2 flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span className="text-sm font-semibold text-white">{rating}</span>
          <span className="text-xs text-zinc-500">/5</span>
        </div>

        {/* Body */}
        {body && is_spoiler ? (
          <SpoilerReveal body={body} />
        ) : truncated ? (
          <p className="text-sm leading-relaxed text-zinc-400">
            {truncated}
            {body && body.length > 300 && (
              <Link href={`/review/${id}`} className="ml-1 text-indigo-400 transition-colors hover:text-indigo-300">
                Read more…
              </Link>
            )}
          </p>
        ) : null}

        {body && !is_spoiler && body.length <= 300 && (
          <Link href={`/review/${id}`} className="mt-2 block text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            Read full review →
          </Link>
        )}
      </div>
    </div>
  );
}

// Showcase list card — shown in "list" showcase mode
function ShowcaseListCard({ list, username }: { list: ShowcaseListData; username: string }) {
  const covers = list.list_entries.slice(0, 4).map((e) => e.games?.cover_url ?? null);
  const likeCount  = list.list_likes.length;
  const entryCount = list.list_entries.length;

  return (
    <Link
      href={`/user/${username}/lists/${list.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-violet-500/20 bg-zinc-900 transition-colors hover:border-violet-500/40"
    >
      {/* ✦ Showcase badge */}
      <span className="absolute right-3 top-3 z-10 text-[10px] font-medium text-violet-400">✦ Showcase</span>

      {/* 2×2 cover grid */}
      <div className="grid grid-cols-2 gap-px overflow-hidden bg-zinc-800">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="relative aspect-[2/3] bg-zinc-800">
            {covers[i] ? (
              <Image
                src={igdbCover(covers[i]!, "t_cover_big")!}
                alt=""
                fill
                sizes="(max-width: 640px) 25vw, 15vw"
                className="object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="h-full w-full bg-zinc-800" />
            )}
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-1 font-semibold text-white transition-colors group-hover:text-violet-300">
          {list.title}
        </p>
        <p className="text-xs text-zinc-500">
          {entryCount} {entryCount === 1 ? "game" : "games"}
        </p>
        {list.description && (
          <p className="line-clamp-2 text-xs italic leading-snug text-zinc-500">
            {list.description}
          </p>
        )}
        {likeCount > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {likeCount}
          </div>
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
