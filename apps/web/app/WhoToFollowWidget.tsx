"use client";

// WhoToFollowWidget — shown on the homepage for logged-in users.
// Displays up to 3 suggested users to follow based on taste-matching
// (shared logged games) with a popular-user fallback.
// Cards fade out and are removed from the DOM after the user follows.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { igdbCover } from "@/lib/igdb";
import { avatarBg } from "@/lib/avatarBg";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestedUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  sharedGames: number; // 0 = popular-user fallback
  favouriteCovers: string[]; // up to 3 IGDB cover URL fragments
};

// ─── Widget ───────────────────────────────────────────────────────────────────

export function WhoToFollowWidget({
  suggestions,
  currentUserId,
}: {
  suggestions: SuggestedUser[];
  currentUserId: string;
}) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(suggestions.map((s) => s.id))
  );

  const visibleSuggestions = suggestions.filter((s) => visible.has(s.id));
  if (visibleSuggestions.length === 0) return null;

  function handleFollowed(userId: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-base font-semibold text-white">Who to Follow</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {visibleSuggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            currentUserId={currentUserId}
            onFollowed={() => handleFollowed(suggestion.id)}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  currentUserId,
  onFollowed,
}: {
  suggestion: SuggestedUser;
  currentUserId: string;
  onFollowed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [fading, setFading] = useState(false);

  async function handleFollow() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("follows")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ follower_id: currentUserId, followee_id: suggestion.id } as any);
    setLoading(false);
    setFading(true);
    setTimeout(onFollowed, 300);
  }

  return (
    <div
      className={`flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-opacity duration-300 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <Link href={`/user/${suggestion.username}`} tabIndex={-1} aria-hidden="true">
          {suggestion.avatarUrl ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-zinc-700">
              <Image
                src={suggestion.avatarUrl}
                alt={suggestion.displayName}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
          ) : (
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ring-2 ring-zinc-700 ${avatarBg(suggestion.username)}`}
            >
              {suggestion.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </Link>

        <div className="min-w-0">
          <Link
            href={`/user/${suggestion.username}`}
            className="block truncate font-semibold text-white transition-colors hover:text-zinc-300"
          >
            {suggestion.displayName}
          </Link>
          <p className="truncate text-xs text-zinc-500">@{suggestion.username}</p>
        </div>
      </div>

      {/* Favourite game covers */}
      {suggestion.favouriteCovers.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-zinc-600">Favourite games</p>
          <div className="flex items-center gap-2">
            {suggestion.favouriteCovers.slice(0, 3).map((url, i) => (
              <div
                key={i}
                className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-zinc-800"
              >
                <Image
                  src={igdbCover(url, "t_cover_big")!}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared games count — only shown for taste-matched suggestions */}
      {suggestion.sharedGames >= 1 && (
        <p className="mt-2 text-xs text-violet-400">
          {suggestion.sharedGames} game{suggestion.sharedGames !== 1 ? "s" : ""} in common
        </p>
      )}

      {/* Follow button */}
      <button
        onClick={handleFollow}
        disabled={loading || fading}
        className="mt-4 w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
      >
        {loading ? "…" : "Follow"}
      </button>
    </div>
  );
}
