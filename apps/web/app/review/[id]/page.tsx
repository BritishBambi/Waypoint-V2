// apps/web/app/review/[id]/page.tsx
// Server-rendered review detail page with emoji reactions and comments.
// Accepts ?edit=true to drop the user straight into edit mode.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { igdbCover } from "@/lib/igdb";
import type { Tables } from "@waypoint/types";
import { ReviewActions } from "./ReviewActions";
import { CommentsSection } from "./CommentsSection";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewComment = {
  id: string;
  review_id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_id: string | null;
  profiles: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    active_title: { name: string; color: string; steam_app_id: number | null; game: { cover_url: string | null; icon_hash: string | null } | null } | null;
  } | null;
};

interface Props {
  params: { id: string };
  searchParams: { edit?: string };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReviewDetailPage({ params, searchParams }: Props) {
  const { id } = params;
  const startEditing = searchParams?.edit === "true";
  const supabase = await createClient();

  const [{ data: { user } }, { data: rawReview }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("reviews")
      .select("*, profiles!reviews_user_id_fkey(username, display_name, avatar_url)")
      .eq("id", id)
      .eq("is_draft", false)
      .not("published_at", "is", null)
      .maybeSingle(),
  ]);

  if (!rawReview) notFound();

  const review = rawReview as Tables<"reviews"> & {
    profiles: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
  };

  const [{ data: rawGame }, { data: rawReactions }, { data: rawComments }, { data: rawUserLog }] =
    await Promise.all([
      supabase
        .from("games")
        .select("id, slug, title, release_date, cover_url")
        .eq("id", review.game_id)
        .maybeSingle(),
      (supabase as any)
        .from("review_reactions")
        .select("emoji, user_id")
        .eq("review_id", id),
      (supabase as any)
        .from("review_comments")
        .select("id, review_id, user_id, body, created_at, reply_to_id, profiles(username, display_name, avatar_url, active_title:titles!active_title_id(name, color, steam_app_id, game:games(cover_url, icon_hash)))")
        .eq("review_id", id)
        .order("created_at", { ascending: true })
        .limit(100),
      user
        ? supabase
            .from("game_logs")
            .select("status")
            .eq("user_id", user.id)
            .eq("game_id", review.game_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Aggregate reaction counts per emoji and collect the viewer's own reactions.
  const allReactions = (rawReactions ?? []) as { emoji: string; user_id: string }[];
  const reactionCounts: Record<string, number> = {};
  for (const r of allReactions) {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1;
  }
  const userReactions = user
    ? allReactions.filter((r) => r.user_id === user.id).map((r) => r.emoji)
    : [];

  const isOwner = !!user && user.id === review.user_id;
  const userLogStatus = (rawUserLog as { status: string } | null)?.status ?? null;
  const autoRevealSpoilers =
    isOwner ||
    userLogStatus === "played" ||
    userLogStatus === "playing";
  let isPinned = false;
  if (user && isOwner) {
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("featured_review_id")
      .eq("id", user.id)
      .maybeSingle();
    isPinned = (ownerProfile as any)?.featured_review_id === id;
  }

  const game = rawGame as {
    id: number; slug: string; title: string;
    release_date: string | null; cover_url: string | null;
  } | null;

  const comments = (rawComments ?? []) as ReviewComment[];
  const author = review.profiles;
  const displayName = author?.display_name ?? author?.username ?? "Anonymous";
  const year = game?.release_date ? game.release_date.slice(0, 4) : null;
  const coverUrl = igdbCover(game?.cover_url ?? null, "t_cover_big");

  const dateStr = review.published_at
    ? new Date(review.published_at).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
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
          <Link href={`/games/${game.slug}`} className="group mb-8 flex items-center gap-4">
            <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-md bg-zinc-800 shadow-lg shadow-black/40">
              {coverUrl && (
                <Image src={coverUrl} alt={game.title} fill sizes="48px" quality={85} className="object-cover" />
              )}
            </div>
            <div>
              <p className="font-semibold text-white transition-colors group-hover:text-violet-400">
                {game.title}
              </p>
              {year && <p className="text-sm text-zinc-500">{year}</p>}
            </div>
          </Link>
        )}

        {/* ── Review card ───────────────────────────────────────────────── */}
        <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">

          {/* Author row */}
          <div className="mb-5 flex items-center gap-3">
            {author?.username ? (
              <Link href={`/user/${author.username}`} className="shrink-0">
                <Avatar url={author?.avatar_url ?? null} name={displayName} size={40} />
              </Link>
            ) : (
              <Avatar url={author?.avatar_url ?? null} name={displayName} size={40} />
            )}
            <div>
              {author?.username ? (
                <Link href={`/user/${author.username}`} className="font-medium text-white hover:underline">
                  {displayName}
                </Link>
              ) : (
                <p className="font-medium text-white">{displayName}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                {author?.username && (
                  <Link href={`/user/${author.username}`} className="transition-colors hover:text-zinc-300">
                    @{author.username}
                  </Link>
                )}
                {dateStr && <span>{dateStr}</span>}
              </div>
            </div>
          </div>

          {/* Rating + body + edit/delete — all managed by ReviewActions */}
          <ReviewActions
            reviewId={id}
            userId={user?.id ?? null}
            isOwner={isOwner}
            initialBody={review.body}
            initialRating={review.rating}
            initialIsSpoiler={review.is_spoiler}
            initialIsPinned={isPinned}
            gameSlug={game?.slug ?? ""}
            startEditing={startEditing}
            initialReactionCounts={reactionCounts}
            initialUserReactions={userReactions}
            autoRevealSpoilers={autoRevealSpoilers}
          />
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-zinc-700"
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image src={url} alt={name} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
