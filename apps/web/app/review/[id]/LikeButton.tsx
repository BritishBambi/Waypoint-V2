"use client";

// LikeButton — heart toggle for review pages.
// Optimistically updates count and fill state; rolls back on error.
// Unauthenticated clicks redirect to /login.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  reviewId: string;
  userId: string | null;
  initialCount: number;
  initialLiked: boolean;
}

export function LikeButton({ reviewId, userId, initialCount, initialLiked }: Props) {
  const [liked, setLiked]     = useState(initialLiked);
  const [count, setCount]     = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (!userId) {
      router.push("/login");
      return;
    }
    if (loading) return;

    // Optimistic update.
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((n) => (wasLiked ? n - 1 : n + 1));
    setLoading(true);

    const supabase = createClient();
    let error: unknown;

    if (wasLiked) {
      const res = await (supabase as any)
        .from("review_likes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", userId);
      error = res.error;
    } else {
      const res = await (supabase as any)
        .from("review_likes")
        .insert({ review_id: reviewId, user_id: userId });
      error = res.error;
    }

    if (error) {
      // Roll back.
      setLiked(wasLiked);
      setCount((n) => (wasLiked ? n + 1 : n - 1));
    }

    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-pressed={liked}
      aria-label={liked ? "Unlike this review" : "Like this review"}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        liked
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
      }`}
    >
      <HeartIcon filled={liked} className="h-4 w-4" />
      <span>{count === 1 ? "1 like" : `${count} likes`}</span>
    </button>
  );
}

// ─── HeartIcon ────────────────────────────────────────────────────────────────

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
