"use client";

// FollowButton — optimistic follow/unfollow toggle.
//
// Renders three states:
//   • Not following  → filled violet "Follow" button
//   • Following      → outline button, label switches to "Unfollow" on hover
//   • Loading        → disabled with ellipsis
//
// If currentUserId is null (logged-out visitor), clicking redirects to /login.
// After each successful mutation, router.refresh() re-renders the Server
// Component tree so the follower count stays accurate.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  profileId: string;
  currentUserId: string | null;
  initialIsFollowing: boolean;
}

export function FollowButton({ profileId, currentUserId, initialIsFollowing }: Props) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [loading, setLoading] = useState(false);
  const [hovering, setHovering] = useState(false);

  async function handleClick() {
    if (!currentUserId) {
      router.push("/login");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("followee_id", profileId);
      setIsFollowing(false);
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: currentUserId, followee_id: profileId });
      setIsFollowing(true);
    }

    setLoading(false);
    // Re-render the page to sync the server-rendered follower count.
    router.refresh();
  }

  if (isFollowing) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          hovering
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : "border-zinc-600 text-zinc-300"
        }`}
      >
        {loading ? "…" : hovering ? "Unfollow" : "Following"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
    >
      {loading ? "…" : "Follow"}
    </button>
  );
}
