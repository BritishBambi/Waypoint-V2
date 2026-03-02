"use client";

// Notification bell with realtime badge and dropdown panel.
// Rendered in Nav when a user is logged in.

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationRow = {
  id: string;
  type: "follow" | "review_like" | "review_comment";
  read: boolean;
  created_at: string;
  review_id: string | null;
  comment_id: string | null;
  actor: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  review: {
    id: string;
    games: { title: string; slug: string } | null;
  } | null;
  comment_body: string | null; // joined separately
};

// Likes on the same review are bunched together in the UI.
type BunchedLike = {
  kind: "like_bunch";
  reviewId: string;
  gameTitle: string;
  gameSlug: string;
  actors: Array<{ username: string; display_name: string | null; avatar_url: string | null }>;
  unread: boolean;
  latestId: string; // id of newest notification in bunch (for mark-read)
  ids: string[];    // all ids in bunch
};

type SingleNotification = NotificationRow & { kind: "single" };

type DisplayItem = BunchedLike | SingleNotification;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function actorName(actor: NotificationRow["actor"]): string {
  return actor?.display_name ?? actor?.username ?? "Someone";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select(`
        id, type, read, created_at, review_id, comment_id,
        actor:profiles!actor_id(id, username, display_name, avatar_url),
        review:reviews(id, games(title, slug))
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) return;

    // For comment notifications, fetch comment body in a second query.
    const commentIds = (data as any[])
      .filter((n) => n.type === "review_comment" && n.comment_id)
      .map((n) => n.comment_id as string);

    let bodyMap: Record<string, string> = {};
    if (commentIds.length > 0) {
      const { data: comments } = await supabase
        .from("review_comments")
        .select("id, body")
        .in("id", commentIds);
      (comments ?? []).forEach((c: any) => { bodyMap[c.id] = c.body; });
    }

    const enriched = (data as any[]).map((n) => ({
      ...n,
      comment_body: n.comment_id ? (bodyMap[n.comment_id] ?? null) : null,
    })) as NotificationRow[];

    setItems(enriched);
  }, [userId, supabase]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Realtime ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => { fetchNotifications(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, fetchNotifications]);

  // ── Close on outside click ────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // ── Mark read ─────────────────────────────────────────────────────────────

  async function markRead(ids: string[]) {
    // Cast — PostgrestVersion 14.1 update type inference regression
    await (supabase as any)
      .from("notifications")
      .update({ read: true })
      .in("id", ids);
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await markRead(unreadIds);
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const unreadCount = items.filter((n) => !n.read).length;

  // Bunch consecutive like notifications by review_id.
  const displayItems: DisplayItem[] = (() => {
    const result: DisplayItem[] = [];
    const likeBunches: Record<string, BunchedLike> = {};

    for (const n of items) {
      if (n.type === "review_like" && n.review_id) {
        const key = n.review_id;
        if (likeBunches[key]) {
          const bunch = likeBunches[key];
          bunch.actors.push({
            username: n.actor?.username ?? "",
            display_name: n.actor?.display_name ?? null,
            avatar_url: n.actor?.avatar_url ?? null,
          });
          bunch.ids.push(n.id);
          if (!n.read) bunch.unread = true;
        } else {
          const bunch: BunchedLike = {
            kind: "like_bunch",
            reviewId: n.review_id,
            gameTitle: (n.review?.games as any)?.title ?? "a game",
            gameSlug: (n.review?.games as any)?.slug ?? "",
            actors: [{
              username: n.actor?.username ?? "",
              display_name: n.actor?.display_name ?? null,
              avatar_url: n.actor?.avatar_url ?? null,
            }],
            unread: !n.read,
            latestId: n.id,
            ids: [n.id],
          };
          likeBunches[key] = bunch;
          result.push(bunch);
        }
      } else {
        result.push({ ...n, kind: "single" });
      }
    }

    return result;
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Bell button ───────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        {open ? (
          /* Filled bell when open */
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        ) : (
          /* Outline bell when closed */
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {displayItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-600">
                No notifications yet
              </p>
            ) : (
              displayItems.map((item) =>
                item.kind === "like_bunch" ? (
                  <LikeBunchRow
                    key={`bunch-${item.reviewId}`}
                    item={item}
                    onRead={() => markRead(item.ids)}
                    onClose={() => setOpen(false)}
                  />
                ) : (
                  <SingleRow
                    key={item.id}
                    item={item}
                    onRead={() => markRead([item.id])}
                    onClose={() => setOpen(false)}
                  />
                )
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row sub-components ────────────────────────────────────────────────────────

function RowWrapper({
  unread,
  href,
  onRead,
  onClose,
  children,
}: {
  unread: boolean;
  href: string;
  onRead: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => { onRead(); onClose(); }}
      className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-900 ${unread ? "border-l-2 border-violet-500" : "border-l-2 border-transparent"}`}
    >
      {children}
    </Link>
  );
}

function Avatar({ url, username }: { url: string | null; username: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={username}
      className="h-8 w-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold uppercase text-zinc-300">
      {username.charAt(0)}
    </div>
  );
}

function SingleRow({
  item,
  onRead,
  onClose,
}: {
  item: SingleNotification;
  onRead: () => void;
  onClose: () => void;
}) {
  const actor = item.actor;
  const name = actorName(actor);

  if (item.type === "follow") {
    return (
      <RowWrapper
        unread={!item.read}
        href={`/user/${actor?.username ?? ""}`}
        onRead={onRead}
        onClose={onClose}
      >
        <Avatar url={actor?.avatar_url ?? null} username={actor?.username ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-zinc-300">
            <span className="font-medium text-white">{name}</span>{" "}
            started following you.
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">{timeAgo(item.created_at)}</p>
        </div>
      </RowWrapper>
    );
  }

  if (item.type === "review_comment") {
    const gameSlug = (item.review?.games as any)?.slug ?? "";
    const gameTitle = (item.review?.games as any)?.title ?? "your review";
    const preview = item.comment_body
      ? item.comment_body.length > 60
        ? item.comment_body.slice(0, 60) + "…"
        : item.comment_body
      : null;

    return (
      <RowWrapper
        unread={!item.read}
        href={gameSlug ? `/games/${gameSlug}` : "/"}
        onRead={onRead}
        onClose={onClose}
      >
        <Avatar url={actor?.avatar_url ?? null} username={actor?.username ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-zinc-300">
            <span className="font-medium text-white">{name}</span>{" "}
            commented on your review of{" "}
            <span className="font-medium text-white">{gameTitle}</span>.
          </p>
          {preview && (
            <p className="mt-0.5 line-clamp-2 text-xs italic text-zinc-500">
              &ldquo;{preview}&rdquo;
            </p>
          )}
          <p className="mt-0.5 text-xs text-zinc-600">{timeAgo(item.created_at)}</p>
        </div>
      </RowWrapper>
    );
  }

  // Fallback (shouldn't reach here for likes — those are bunched)
  return null;
}

function LikeBunchRow({
  item,
  onRead,
  onClose,
}: {
  item: BunchedLike;
  onRead: () => void;
  onClose: () => void;
}) {
  const [first, second] = item.actors;
  const others = item.actors.length - 2;

  let actorText: string;
  if (item.actors.length === 1) {
    actorText = first.display_name ?? first.username;
  } else if (item.actors.length === 2) {
    actorText = `${first.display_name ?? first.username} and ${second.display_name ?? second.username}`;
  } else {
    actorText = `${first.display_name ?? first.username}, ${second.display_name ?? second.username}, and ${others} other${others === 1 ? "" : "s"}`;
  }

  return (
    <RowWrapper
      unread={item.unread}
      href={item.gameSlug ? `/games/${item.gameSlug}` : "/"}
      onRead={onRead}
      onClose={onClose}
    >
      {/* Stack up to 2 avatars */}
      <div className="relative h-8 shrink-0" style={{ width: item.actors.length > 1 ? "44px" : "32px" }}>
        {item.actors.slice(0, 2).map((a, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: i === 0 ? 0 : 12, zIndex: 2 - i }}
          >
            <Avatar url={a.avatar_url} username={a.username} />
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-zinc-300">
          <span className="font-medium text-white">{actorText}</span>{" "}
          liked your review of{" "}
          <span className="font-medium text-white">{item.gameTitle}</span>.
        </p>
      </div>
    </RowWrapper>
  );
}
