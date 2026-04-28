"use client";

// apps/web/app/search/page.tsx
//
// Two-tab search page: Games (existing IGDB search) and Users (profile search).
//
// Tab state lives in the URL: ?tab=games | ?tab=users
// useSearchParams() requires a Suspense boundary — the default export wraps the
// inner component so Next.js can still statically analyse the route.

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useGameSearch, type GameSearchResult } from "@waypoint/api-client";
import { createClient } from "@/lib/supabase/client";
import { igdbCover } from "@/lib/igdb";
import { FollowButton } from "@/app/user/[username]/FollowButton";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserResult = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  followerCount: number;
  likeCount: number;
};

type Viewer = {
  userId: string | null;
  followeeIds: Set<string>;
};

type PopularGame = {
  id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  igdb_rating: number | null;
  release_year: number | null;
};

const PAGE_SIZE   = 25;
const TOTAL_PAGES = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600",
];

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

// Loads the current viewer's user ID and the set of profiles they follow.
// Used to populate the initialIsFollowing prop on each UserCard's FollowButton.
function useViewer() {
  return useQuery<Viewer>({
    queryKey: ["viewer"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { userId: null, followeeIds: new Set<string>() };

      const { data } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id);

      return {
        userId: user.id,
        followeeIds: new Set(
          (data as Array<{ followee_id: string }> ?? []).map((r) => r.followee_id)
        ),
      };
    },
    staleTime: 60_000,
  });
}

// Searches profiles by username or display_name (case-insensitive).
// Also fetches follower counts for the result set in the same queryFn so
// each card can display "X followers" without a separate request.
function useUserSearch(query: string) {
  return useQuery<UserResult[]>({
    queryKey: ["user-search", query],
    queryFn: async () => {
      const supabase = createClient();

      // 1. Find matching profiles.
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      if (!profiles || profiles.length === 0) return [];

      // 2. Fetch follower counts for these profiles in one query.
      const ids = (profiles as Array<{ id: string }>).map((p) => p.id);
      const { data: followData } = await supabase
        .from("follows")
        .select("followee_id")
        .in("followee_id", ids);

      const countMap = new Map<string, number>();
      for (const row of (followData as Array<{ followee_id: string }> ?? [])) {
        countMap.set(row.followee_id, (countMap.get(row.followee_id) ?? 0) + 1);
      }

      return (profiles as Array<{
        id: string; username: string; display_name: string | null;
        bio: string | null; avatar_url: string | null;
      }>).map((p) => ({ ...p, followerCount: countMap.get(p.id) ?? 0, likeCount: 0 }));
    },
    enabled: query.trim().length >= 3,
    staleTime: 30_000,
  });
}

// Returns up to 20 profiles ranked by like_count DESC, follower_count DESC.
// All profiles are included (LEFT JOIN semantics) so new users with zero
// likes/followers still appear at the bottom of the list.
function usePopularUsers() {
  return useQuery<UserResult[]>({
    queryKey: ["popular-users"],
    queryFn: async () => {
      const supabase = createClient();

      // 1. Fetch all profiles (limit 20 — enough for the idle directory).
      const { data: rawProfiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url")
        .limit(20);

      const profiles = (rawProfiles as Array<{
        id: string; username: string; display_name: string | null;
        bio: string | null; avatar_url: string | null;
      }> ?? []);

      if (profiles.length === 0) return [];

      const profileIds = profiles.map((p) => p.id);

      // 2. Follower counts and review IDs in parallel.
      const [followRes, reviewRes] = await Promise.all([
        supabase
          .from("follows")
          .select("followee_id")
          .in("followee_id", profileIds),
        supabase
          .from("reviews")
          .select("id, user_id")
          .in("user_id", profileIds),
      ]);

      // Aggregate follower counts.
      const followerMap = new Map<string, number>();
      for (const row of (followRes.data as Array<{ followee_id: string }> ?? [])) {
        followerMap.set(row.followee_id, (followerMap.get(row.followee_id) ?? 0) + 1);
      }

      // 3. Like counts — one query across all review IDs found above.
      const reviewRows = (reviewRes.data as Array<{ id: string; user_id: string }> ?? []);
      const reviewIds = reviewRows.map((r) => r.id);
      // Map review_id → user_id so we can attribute likes back to the profile.
      const reviewOwnerMap = new Map(reviewRows.map((r) => [r.id, r.user_id]));

      const likeMap = new Map<string, number>(); // profile_id → total likes
      if (reviewIds.length > 0) {
        const { data: likeData } = await supabase
          .from("review_likes")
          .select("review_id")
          .in("review_id", reviewIds);

        for (const row of (likeData as Array<{ review_id: string }> ?? [])) {
          const ownerId = reviewOwnerMap.get(row.review_id);
          if (ownerId) likeMap.set(ownerId, (likeMap.get(ownerId) ?? 0) + 1);
        }
      }

      // 4. Combine and sort: like_count DESC → follower_count DESC → registration order.
      return profiles
        .map((p) => ({
          ...p,
          followerCount: followerMap.get(p.id) ?? 0,
          likeCount: likeMap.get(p.id) ?? 0,
        }))
        .sort((a, b) =>
          b.likeCount !== a.likeCount
            ? b.likeCount - a.likeCount
            : b.followerCount - a.followerCount
        );
    },
    staleTime: 5 * 60_000,
  });
}

// Returns one page of globally popular games from the igdb-popular Edge Function.
function usePopularGames(page: number) {
  return useQuery<PopularGame[]>({
    queryKey: ["popular-games", page],
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${base}/functions/v1/igdb-popular`, {
        method: "POST",
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status} from igdb-popular`);
      }
      const data = await res.json();
      return (data?.results as PopularGame[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Page entry ───────────────────────────────────────────────────────────────

// Suspense boundary required by useSearchParams() in Next.js 14 App Router.
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SearchPageInner />
    </Suspense>
  );
}

// ─── Inner page (reads URL state) ─────────────────────────────────────────────

function SearchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Tab from URL: default to "games".
  const tab = (searchParams.get("tab") ?? "games") as "games" | "users";

  const [input, setInput] = useState("");
  const query = useDebounce(input, 400);

  function switchTab(next: "games" | "users") {
    const params = new URLSearchParams();
    params.set("tab", next);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }

  const placeholder =
    tab === "users" ? "Search for a user…" : "Search for a game…";

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">

        {/* ── Search input ───────────────────────────────────────────── */}
        <div className="relative mb-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-4 pl-12 pr-4 text-lg text-white placeholder-zinc-500 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        {/* ── Tab switcher ───────────────────────────────────────────── */}
        <div className="mb-8 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 w-fit">
          <TabButton active={tab === "games"} onClick={() => switchTab("games")}>
            Games
          </TabButton>
          <TabButton active={tab === "users"} onClick={() => switchTab("users")}>
            People
          </TabButton>
        </div>

        {/* ── Tab content ────────────────────────────────────────────── */}
        {tab === "games" ? (
          <GamesPanel query={query} />
        ) : (
          <UsersPanel query={query} />
        )}

      </div>
    </main>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-violet-600 text-white"
          : "text-zinc-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Games panel (unchanged behaviour) ────────────────────────────────────────

function GamesPanel({ query }: { query: string }) {
  // directoryPage lives here (not inside PopularGamesPanel) so it survives
  // the panel unmounting when the user types a query and then clears it.
  const [directoryPage, setDirectoryPage] = useState(1);
  const { results, isLoading, isError, error } = useGameSearch(query);
  const hasQuery = query.trim().length >= 3;

  if (!hasQuery)
    return <PopularGamesPanel page={directoryPage} onPageChange={setDirectoryPage} />;
  if (isLoading) return <SkeletonGrid />;
  if (isError)   return <ErrorState error={error} />;
  if (results.length === 0) return <GamesEmptyState query={query} />;
  return <ResultsGrid results={results} />;
}

// ─── Users panel ──────────────────────────────────────────────────────────────

function UsersPanel({ query }: { query: string }) {
  const hasQuery = query.trim().length >= 3;
  const { data: viewer } = useViewer();

  if (!hasQuery) return <PopularUsersPanel viewer={viewer} />;
  return <UserSearchPanel query={query} viewer={viewer} />;
}

// Popular on Waypoint — shown when no query is entered on the Users tab.
function PopularUsersPanel({ viewer }: { viewer: Viewer | undefined }) {
  const { data: users, isLoading } = usePopularUsers();

  if (isLoading) return <UserSkeletonList />;
  if (!users || users.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-lg font-medium text-zinc-300">Explore Waypoint</p>
        <p className="mt-1 text-sm text-zinc-500">
          Search for users to follow them and see their activity.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Popular on Waypoint
      </h2>
      <div className="space-y-3">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            currentUserId={viewer?.userId ?? null}
            isFollowing={viewer?.followeeIds.has(user.id) ?? false}
            isCurrentUser={viewer?.userId === user.id}
          />
        ))}
      </div>
    </div>
  );
}

// User search results — shown when the query is 3+ characters.
function UserSearchPanel({
  query,
  viewer,
}: {
  query: string;
  viewer: Viewer | undefined;
}) {
  const { data: users, isLoading, isError, error } = useUserSearch(query);

  if (isLoading) return <UserSkeletonList />;
  if (isError) return <ErrorState error={error} />;
  if (!users || users.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="mb-4 rounded-full bg-zinc-900 p-5">
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
            className="text-zinc-500"
            aria-hidden="true"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
        <p className="text-lg font-medium text-zinc-300">
          No users found for &ldquo;{query}&rdquo;
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Try a different name or username
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          currentUserId={viewer?.userId ?? null}
          isFollowing={viewer?.followeeIds.has(user.id) ?? false}
          isCurrentUser={viewer?.userId === user.id}
        />
      ))}
    </div>
  );
}

// ─── UserCard ─────────────────────────────────────────────────────────────────

function UserCard({
  user,
  currentUserId,
  isFollowing,
  isCurrentUser,
}: {
  user: UserResult;
  currentUserId: string | null;
  isFollowing: boolean;
  isCurrentUser: boolean;
}) {
  const name = user.display_name ?? user.username;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700">

      {/* Avatar — links to profile */}
      <Link href={`/user/${user.username}`} className="shrink-0">
        {user.avatar_url ? (
          <div className="relative h-12 w-12 overflow-hidden rounded-full">
            <Image
              src={user.avatar_url}
              alt={name}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        ) : (
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${avatarBg(user.username)}`}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>

      {/* Text — links to profile */}
      <Link href={`/user/${user.username}`} className="min-w-0 flex-1">
        <p className="font-semibold text-white transition-colors hover:text-violet-300">
          {name}
        </p>
        <p className="text-sm text-zinc-500">@{user.username}</p>
        {user.bio && (
          <p className="mt-0.5 truncate text-xs text-zinc-500">{user.bio}</p>
        )}
        <p className="mt-1 text-xs text-zinc-600">
          {user.followerCount === 1
            ? "1 follower"
            : `${user.followerCount} followers`}
        </p>
      </Link>

      {/* Follow button — hidden on the viewer's own card */}
      {!isCurrentUser && (
        <div className="shrink-0">
          <FollowButton
            profileId={user.id}
            currentUserId={currentUserId}
            initialIsFollowing={isFollowing}
          />
        </div>
      )}

    </div>
  );
}

// ─── User skeleton ────────────────────────────────────────────────────────────

function UserSkeletonList() {
  return (
    <div className="space-y-3" aria-label="Loading users">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-800" />
            <div className="h-3 w-20 animate-pulse rounded-full bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Popular Games directory (Games tab idle state) ───────────────────────────

function PopularGamesPanel({
  page,
  onPageChange,
}: {
  page: number;
  onPageChange: (p: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: games, isLoading, isError, error } = usePopularGames(page);

  function goToPage(p: number) {
    onPageChange(p);
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={containerRef}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500">
        Popular Games
      </h2>
      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <ErrorState error={error} />
      ) : !games || games.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No popular games found.</p>
      ) : (
        <>
          <PopularGamesGrid games={games} />
          <PaginationControls page={page} totalPages={TOTAL_PAGES} onPageChange={goToPage} />
        </>
      )}
    </div>
  );
}

function PopularGamesGrid({ games }: { games: PopularGame[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {games.map((game) => (
        <PopularGameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

function PopularGameCard({ game }: { game: PopularGame }) {
  const coverUrl = game.cover_url ? igdbCover(game.cover_url, "t_720p") : null;

  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-all duration-200 hover:-translate-y-1 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/40"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={game.title}
            fill
            sizes="(max-width: 768px) 50vw, 20vw"
            quality={90}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
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
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
          {game.title}
        </p>
        {game.release_year && (
          <p className="text-xs text-zinc-500">{game.release_year}</p>
        )}
      </div>
    </Link>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      {/* Left arrow — hidden on page 1, placeholder keeps indicator centred */}
      {page > 1 ? (
        <button
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
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
        </button>
      ) : (
        <div className="w-8" aria-hidden="true" />
      )}

      <span className="text-sm text-zinc-400">
        Page {page} of {totalPages}
      </span>

      {/* Right arrow — hidden on last page */}
      {page < totalPages ? (
        <button
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      ) : (
        <div className="w-8" aria-hidden="true" />
      )}
    </div>
  );
}

// ─── Games panel sub-components ───────────────────────────────────────────────

function GamesEmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-zinc-900 p-5">
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
          className="text-zinc-500"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M8 11h6M11 8v6" />
        </svg>
      </div>
      <p className="text-lg font-medium text-zinc-300">
        No results for &ldquo;{query}&rdquo;
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        Try a different title or check your spelling
      </p>
    </div>
  );
}

function ResultsGrid({ results }: { results: GameSearchResult[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {results.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

function GameCard({ game }: { game: GameSearchResult }) {
  const year = game.release_date ? game.release_date.slice(0, 4) : null;
  const genres = game.genres?.slice(0, 2) ?? [];

  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-all duration-200 hover:-translate-y-1 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/40"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {game.cover_url ? (
          <Image
            src={igdbCover(game.cover_url, "t_720p")!}
            alt={game.title}
            fill
            sizes="(max-width: 768px) 50vw, 20vw"
            quality={90}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
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
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
          {game.title}
        </p>
        {year && <p className="text-xs text-zinc-500">{year}</p>}
        {genres.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-label="Loading results"
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
        >
          <div className="aspect-[2/3] w-full animate-pulse bg-zinc-800" />
          <div className="flex flex-col gap-2 p-3">
            <div className="h-3 w-full animate-pulse rounded-full bg-zinc-800" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-zinc-800" />
            <div className="mt-1 h-3 w-1/3 animate-pulse rounded-full bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-red-500/10 p-5">
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
          className="text-red-400"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="text-lg font-medium text-zinc-300">Search failed</p>
      <p className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-mono text-xs text-red-400">
        {message}
      </p>
    </div>
  );
}
