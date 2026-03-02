"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ListLikeButton({
  listId,
  currentUserId,
  initialLikeCount,
  initialIsLiked,
}: {
  listId: string;
  currentUserId: string | null;
  initialLikeCount: number;
  initialIsLiked: boolean;
}) {
  const [liked, setLiked]   = useState(initialIsLiked);
  const [count, setCount]   = useState(initialLikeCount);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (!currentUserId) { router.push("/login"); return; }
    if (loading) return;
    setLoading(true);
    const supabase = createClient();

    if (liked) {
      await supabase
        .from("list_likes")
        .delete()
        .eq("list_id", listId)
        .eq("user_id", currentUserId);
      setLiked(false);
      setCount((c) => Math.max(0, c - 1));
    } else {
      await supabase
        .from("list_likes")
        .insert({ list_id: listId, user_id: currentUserId });
      setLiked(true);
      setCount((c) => c + 1);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={liked ? "Unlike this list" : "Like this list"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        liked
          ? "border-rose-500/40 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
          : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {count}
    </button>
  );
}
