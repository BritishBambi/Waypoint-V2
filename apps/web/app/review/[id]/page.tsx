// apps/web/app/review/[id]/page.tsx
// Server-rendered review detail page with likes and comments.
// review_likes and review_comments are new tables (migration 0007) whose
// TypeScript types won't appear in database.ts until `pnpm generate:types`
// is run. Queries on those tables use `(supabase as any)` with explicit
// local types until then.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import { LikeButton } from "./LikeButton";
import { CommentsSection } from "./CommentsSection";

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape of a comment row with its author's profile joined.
// TODO: replace with Tables<"review_comments"> after regenerating types.
export type ReviewComment = {
  id: string;
  review_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

interface Props {
  params: { id: string };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = params;
  const supabase = await createClient();

  // Fetch user + review in parallel.
  const [{ data: { user } }, { data: rawReview }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("reviews")
      .select("*, profiles(username, display_name, avatar_url)")
      .eq("id", id)
      .eq("is_draft", false)
      .not("published_at", "is", null)
      .maybeSingle(),
  ]);

  if (!rawReview) notFound();

  // Cast — PostgrestVersion 14.1 collapses join types; see project MEMORY.
  const review = rawReview as typeof rawReview & {
    profiles: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
  };

  // Fetch game info, like count, and comments in parallel.
  const [{ data: rawGame }, { count: likeCount }, { data: rawComments }] =
    await Promise.all([
      supabase
        .from("games")
        .select("id, slug, title, release_date, cover_url")
        .eq("id", review.game_id)
        .maybeSingle(),
      (supabase as any)
        .from("review_likes")
        .select("*", { count: "exact", head: true })
        .eq("review_id", id),
      (supabase as any)
        .from("review_comments")
        .select("*, profiles(username, display_name, avatar_url)")
        .eq("review_id", id)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

  // Check if the logged-in user has already liked this review.
  let userHasLiked = false;
  if (user) {
    const { data: likeRow } = await (supabase as any)
      .from("review_likes")
      .select("id")
      .eq("review_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    userHasLiked = !!likeRow;
  }

  const game = rawGame as {
    id: number;
    slug: string;
    title: string;
    release_date: string | null;
    cover_url: string | null;
  } | null;

  const comments = (rawComments ?? []) as ReviewComment[];
  const author = review.profiles;
  const displayName = author?.display_name ?? author?.username ?? "Anonymous";
  const year = game?.release_date ? game.release_date.slice(0, 4) : null;
  const coverUrl = igdbCover(game?.cover_url ?? null, "t_cover_big");

  const dateStr = review.published_at
    ? new Date(review.published_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-10">

        {/* ── Breadcrumb ────────────────────────────────────────────────── */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-zinc-500" aria-label="Breadcrumb">
          {game ? (
            <Link href={`/games/${game.slug}`} className="transition-colors hover:text-white">
              {game.title}
            </Link>
          ) : (
            <span>Game</span>
          )}
          <span aria-hidden="true">/</span>
          <span>Reviews</span>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-300">{displayName}</span>
        </nav>

        {/* ── Game header ───────────────────────────────────────────────── */}
        {game && (
          <Link
            href={`/games/${game.slug}`}
            className="group mb-8 flex items-center gap-4"
          >
            <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-md bg-zinc-800 shadow-lg shadow-black/40">
              {coverUrl ? (
                <Image
                  src={coverUrl}
                  alt={game.title}
                  fill
                  sizes="48px"
                  quality={85}
                  className="object-cover"
                />
              ) : null}
            </div>
            <div>
              <p className="font-semibold text-white transition-colors group-hover:text-indigo-400">
                {game.title}
              </p>
              {year && <p className="text-sm text-zinc-500">{year}</p>}
            </div>
          </Link>
        )}

        {/* ── Review card ───────────────────────────────────────────────── */}
        <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">

          {/* Author row + rating */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar
                url={author?.avatar_url ?? null}
                name={displayName}
                size={40}
              />
              <div>
                <p className="font-medium text-white">{displayName}</p>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                  {author?.username && <span>@{author.username}</span>}
                  {dateStr && <span>{dateStr}</span>}
                </div>
              </div>
            </div>

            {/* Star rating */}
            <div className="flex shrink-0 items-center gap-1.5">
              <StarIcon className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="text-xl font-bold text-white">{review.rating}</span>
              <span className="text-sm text-zinc-500">/5</span>
            </div>
          </div>

          {/* Body — full, no truncation */}
          {review.body ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 sm:text-base">
              {review.body}
            </p>
          ) : (
            <p className="text-sm italic text-zinc-600">No written review.</p>
          )}

          {/* Like button */}
          <div className="mt-6 border-t border-zinc-800 pt-5">
            <LikeButton
              reviewId={id}
              userId={user?.id ?? null}
              initialCount={likeCount ?? 0}
              initialLiked={userHasLiked}
            />
          </div>
        </article>

        {/* ── Comments ─────────────────────────────────────────────────── */}
        <div className="mt-8">
          <CommentsSection
            reviewId={id}
            userId={user?.id ?? null}
            initialComments={comments}
          />
        </div>

      </div>
    </main>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Avatar({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-zinc-700"
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image
          src={url}
          alt={name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
