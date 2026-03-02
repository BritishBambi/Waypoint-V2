"use client";

// ReviewSection — displays published reviews and lets logged-in users with a
// game log write their own review.  Receives server-prefetched reviews as
// initial state and re-fetches from the browser Supabase client after a write.

import Image from "next/image";
import Link from "next/link";
import { useState, useId } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ReviewWithAuthor, LogSummary } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExistingReview {
  id: string;
  rating: number;
  body: string | null;
}

interface Props {
  reviews: ReviewWithAuthor[];
  gameId: number;
  userId: string | null;
  existingLog: LogSummary | null;
  existingReview: ExistingReview | null;
}

// ─── ReviewSection ────────────────────────────────────────────────────────────

export function ReviewSection({
  reviews: initialReviews,
  gameId,
  userId,
  existingLog,
  existingReview,
}: Props) {
  const [reviews, setReviews] = useState<ReviewWithAuthor[]>(initialReviews);
  const [isWriting, setIsWriting] = useState(false);
  const [hasReview, setHasReview] = useState(!!existingReview);

  async function refetchReviews() {
    const supabase = createClient();
    const { data } = await supabase
      .from("reviews")
      .select("*, profiles(username, display_name, avatar_url)")
      .eq("game_id", gameId)
      .eq("is_draft", false)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(20);

    if (!data) return;

    const base = data as Omit<ReviewWithAuthor, "like_count" | "comment_count">[];
    const ids = base.map((r) => r.id);
    let likeCounts: Record<string, number> = {};
    let commentCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const [{ data: likes }, { data: comments }] = await Promise.all([
        (supabase as any).from("review_likes").select("review_id").in("review_id", ids),
        (supabase as any).from("review_comments").select("review_id").in("review_id", ids),
      ]);
      if (likes) {
        for (const row of likes as { review_id: string }[]) {
          likeCounts[row.review_id] = (likeCounts[row.review_id] ?? 0) + 1;
        }
      }
      if (comments) {
        for (const row of comments as { review_id: string }[]) {
          commentCounts[row.review_id] = (commentCounts[row.review_id] ?? 0) + 1;
        }
      }
    }
    setReviews(base.map((r) => ({
      ...r,
      like_count: likeCounts[r.id] ?? 0,
      comment_count: commentCounts[r.id] ?? 0,
    })));
  }

  const canWrite = !!userId && !!existingLog && !hasReview;

  return (
    <div className="mt-16">
      {/* Section header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          Reviews
          {reviews.length > 0 && (
            <span className="ml-2 text-base font-normal text-zinc-500">
              ({reviews.length})
            </span>
          )}
        </h2>

        {canWrite && !isWriting && (
          <button
            onClick={() => setIsWriting(true)}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Write a Review
          </button>
        )}

        {/* Prompt for users who haven't logged the game yet */}
        {userId && !existingLog && (
          <span className="text-sm text-zinc-500">
            Log this game to write a review
          </span>
        )}
      </div>

      {/* Write review form */}
      {isWriting && existingLog && userId && (
        <WriteReviewForm
          gameId={gameId}
          userId={userId}
          logId={existingLog.id}
          onSaved={async () => {
            setIsWriting(false);
            setHasReview(true);
            await refetchReviews();
          }}
          onCancel={() => setIsWriting(false)}
        />
      )}

      {/* Review list */}
      {reviews.length === 0 && !isWriting ? (
        <EmptyReviews />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WriteReviewForm ──────────────────────────────────────────────────────────

interface WriteReviewFormProps {
  gameId: number;
  userId: string;
  logId: string;
  onSaved: () => void;
  onCancel: () => void;
}

function WriteReviewForm({
  gameId,
  userId,
  logId,
  onSaved,
  onCancel,
}: WriteReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const supabase = createClient();

    const { error: insertErr } = await (supabase as any).from("reviews").insert({
      log_id: logId,
      user_id: userId,
      game_id: gameId,
      rating,
      body: body.trim() || null,
      is_draft: false,
      published_at: new Date().toISOString(),
    });

    if (insertErr) {
      setError(insertErr.message);
      setIsSaving(false);
      return;
    }

    onSaved();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
    >
      <h3 className="mb-4 text-sm font-semibold text-white">Your Review</h3>

      {/* Rating (required) */}
      <div className="mb-4">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          Rating <span className="text-red-400">*</span>
        </label>
        <StarPicker value={rating} onChange={setRating} />
      </div>

      {/* Review body (optional) */}
      <div className="mb-4">
        <label
          htmlFor="review-body"
          className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
        >
          Review <span className="normal-case text-zinc-600">(optional)</span>
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={10000}
          placeholder="Share your thoughts…"
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSaving ? "Publishing…" : "Publish Review"}
        </button>
      </div>
    </form>
  );
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

const TRUNCATE_AT = 200; // characters — full review lives at /review/[id]

function ReviewCard({ review }: { review: ReviewWithAuthor }) {
  const author = review.profiles;
  const displayName = author?.display_name ?? author?.username ?? "Anonymous";
  const initials = displayName.slice(0, 2).toUpperCase();
  const dateStr = review.published_at
    ? new Date(review.published_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const isTruncated = (review.body?.length ?? 0) > TRUNCATE_AT;
  const bodyText = isTruncated
    ? review.body!.slice(0, TRUNCATE_AT).trimEnd() + "…"
    : review.body;

  return (
    <Link
      href={`/review/${review.id}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:bg-zinc-800/60"
    >
      {/* Author + meta */}
      <div className="mb-3 flex items-start gap-3">
        {/* Avatar */}
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-zinc-700">
          {author?.avatar_url ? (
            <Image
              src={author.avatar_url}
              alt={displayName}
              fill
              sizes="36px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400">
              {initials}
            </span>
          )}
        </div>

        <div className="flex flex-1 min-w-0 items-start justify-between gap-4">
          {/* Left: name / username / date */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-medium text-white">{displayName}</span>
              {author?.username && author.username !== displayName && (
                <span className="text-xs text-zinc-500">@{author.username}</span>
              )}
            </div>
            {dateStr && (
              <p className="text-xs text-zinc-500">{dateStr}</p>
            )}
          </div>

          {/* Right: star rating */}
          <div className="flex shrink-0 items-center gap-1 text-yellow-400">
            <StarFilledIcon className="h-3.5 w-3.5" />
            <span className="text-sm font-semibold text-white">{review.rating}</span>
            <span className="text-xs text-zinc-500">/5</span>
          </div>
        </div>
      </div>

      {/* Body */}
      {bodyText ? (
        <>
          <p className="text-sm leading-relaxed text-zinc-300">{bodyText}</p>
          {isTruncated && (
            <span className="mt-2 inline-block text-xs font-medium text-indigo-400">
              Read more
            </span>
          )}
        </>
      ) : (
        <p className="text-xs italic text-zinc-600">No written review.</p>
      )}

      {/* Social counts — bottom right */}
      <div className="mt-4 flex items-center justify-end gap-4 text-sm text-zinc-400">
        <span className="flex items-center gap-1.5">
          <HeartIcon className="h-3.5 w-3.5" />
          {review.like_count}
        </span>
        <span className="flex items-center gap-1.5">
          <ChatBubbleIcon className="h-3.5 w-3.5" />
          {review.comment_count}
        </span>
      </div>
    </Link>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyReviews() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/50 py-12 text-center">
      <div className="mb-3 rounded-full bg-zinc-800 p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-zinc-500"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-300">No reviews yet</p>
      <p className="mt-1 text-xs text-zinc-500">Be the first to leave a review</p>
    </div>
  );
}

// ─── StarPicker ───────────────────────────────────────────────────────────────
// 5-star picker with half-star increments (0.5, 1, 1.5 … 5.0).
// Left half of each star = half-star value; right half = full-star value.
// Clicking the current value deselects (rating resets to 0).

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const uid = useId().replace(/:/g, "");

  const display = hovered > 0 ? hovered : value;

  function starState(i: number): "full" | "half" | "empty" {
    if (display >= i) return "full";
    if (display >= i - 0.5) return "half";
    return "empty";
  }

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, k) => k + 1).map((i) => (
        <div
          key={i}
          className="relative"
          onMouseLeave={() => setHovered(0)}
        >
          <StarSvg state={starState(i)} clipId={`${uid}-${i}`} />
          {/* Left half → half-star */}
          <button
            type="button"
            aria-label={`Rate ${i - 0.5} out of 5`}
            className="absolute inset-0 w-1/2 cursor-pointer"
            onClick={() => onChange(value === i - 0.5 ? 0 : i - 0.5)}
            onMouseEnter={() => setHovered(i - 0.5)}
          />
          {/* Right half → full star */}
          <button
            type="button"
            aria-label={`Rate ${i} out of 5`}
            className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
            onClick={() => onChange(value === i ? 0 : i)}
            onMouseEnter={() => setHovered(i)}
          />
        </div>
      ))}
      {value > 0 && (
        <span className="ml-1.5 text-sm text-zinc-400">{value}/5</span>
      )}
    </div>
  );
}

// ─── StarSvg ──────────────────────────────────────────────────────────────────

function StarSvg({
  state,
  clipId,
}: {
  state: "full" | "half" | "empty";
  clipId: string;
}) {
  const POINTS =
    "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";

  if (state === "full") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="text-yellow-400">
        <polygon points={POINTS} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (state === "half") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
        <polygon points={POINTS} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-zinc-600" />
        <polygon points={POINTS} fill="currentColor" clipPath={`url(#${clipId})`} className="text-yellow-400" />
      </svg>
    );
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="text-zinc-600">
      <polygon points={POINTS} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function StarFilledIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
