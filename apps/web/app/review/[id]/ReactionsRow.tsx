"use client";

// ReactionsRow — emoji reaction pills + picker for the review detail page.
// Shows pills for every emoji that has ≥ 1 reaction; toggling a pill adds or
// removes the current user's reaction. The + button opens an inline picker for
// all 5 emoji options.  Optimistic UI: counts update immediately.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EMOJIS = ["👍", "❤️", "🤡", "😂", "🎉"] as const;
type Emoji = (typeof EMOJIS)[number];

interface Props {
  reviewId: string;
  userId: string | null;
  initialCounts: Record<string, number>;     // emoji → total count
  initialUserReactions: string[];             // emojis the viewer has already used
}

export function ReactionsRow({
  reviewId,
  userId,
  initialCounts,
  initialUserReactions,
}: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [userReactions, setUserReactions] = useState<Set<string>>(
    new Set(initialUserReactions)
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  // Emojis that currently have at least 1 reaction (in canonical order).
  const activeEmojis = EMOJIS.filter((e) => (counts[e] ?? 0) > 0);

  async function toggle(emoji: string) {
    if (!userId) {
      router.push("/login");
      return;
    }
    if (loading) return;

    const wasActive = userReactions.has(emoji);

    // Optimistic update.
    setUserReactions((prev) => {
      const next = new Set(prev);
      wasActive ? next.delete(emoji) : next.add(emoji);
      return next;
    });
    setCounts((prev) => ({
      ...prev,
      [emoji]: Math.max(0, (prev[emoji] ?? 0) + (wasActive ? -1 : 1)),
    }));
    setPickerOpen(false);
    setLoading(emoji);

    const supabase = createClient();
    let error: unknown;

    if (wasActive) {
      const res = await (supabase as any)
        .from("review_reactions")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", userId)
        .eq("emoji", emoji);
      error = res.error;
    } else {
      const res = await (supabase as any)
        .from("review_reactions")
        .insert({ review_id: reviewId, user_id: userId, emoji });
      error = res.error;
    }

    if (error) {
      // Roll back on failure.
      setUserReactions((prev) => {
        const next = new Set(prev);
        wasActive ? next.add(emoji) : next.delete(emoji);
        return next;
      });
      setCounts((prev) => ({
        ...prev,
        [emoji]: Math.max(0, (prev[emoji] ?? 0) + (wasActive ? 1 : -1)),
      }));
    }

    setLoading(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Active reaction pills */}
      {activeEmojis.map((emoji) => (
        <button
          key={emoji}
          onClick={() => toggle(emoji)}
          disabled={loading === emoji}
          aria-pressed={userReactions.has(emoji)}
          aria-label={`React with ${emoji} (${counts[emoji] ?? 0})`}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
            userReactions.has(emoji)
              ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
              : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
          }`}
        >
          <span>{emoji}</span>
          <span className="font-medium tabular-nums">{counts[emoji] ?? 0}</span>
        </button>
      ))}

      {/* + button opens/closes the picker */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add reaction"
          aria-expanded={pickerOpen}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
        >
          <span className="text-base leading-none">+</span>
        </button>

        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 flex gap-1 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggle(emoji)}
                aria-label={`React with ${emoji}`}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors ${
                  userReactions.has(emoji)
                    ? "bg-indigo-500/20 ring-1 ring-indigo-500/40"
                    : "hover:bg-zinc-800"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
