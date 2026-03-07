"use client";

// Notification bell with realtime badge and dropdown panel.
// Rendered in Nav when a user is logged in.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationRow = {
  id: string;
  type: "follow" | "review_like" | "review_reaction" | "review_comment" | "list_like" | "welcome";
  read: boolean;
  created_at: string;
  actor_id: string | null;
  review_id: string | null;
  comment_id: string | null;
  list_id: string | null;
  emoji: string | null;         // set on review_reaction notifications
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
  list: {
    id: string;
    title: string;
  } | null;
  comment_body: string | null; // joined separately
};

// Reactions on the same (review, emoji) are bunched together in the UI.
type BunchedReaction = {
  kind: "reaction_bunch";
  reviewId: string;
  gameTitle: string;
  gameSlug: string;
  emoji: string;   // the shared emoji for this bunch
  actors: Array<{ username: string; display_name: string | null; avatar_url: string | null }>;
  unread: boolean;
  latestId: string; // id of newest notification in bunch (for mark-read)
  ids: string[];    // all ids in bunch
};

type SingleNotification = NotificationRow & { kind: "single" };

type DisplayItem = BunchedReaction | SingleNotification;

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
  const [selfUsername, setSelfUsername] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    // Fetch notifications without embedding actor — actor_id can be NULL for
    // system notifications (e.g. welcome), and PostgREST may drop those rows
    // when using an embedded select on a nullable FK column.
    const { data } = await supabase
      .from("notifications")
      .select(`
        id, type, read, created_at, actor_id, review_id, comment_id, list_id, emoji,
        review:reviews(id, games(title, slug)),
        list:lists(id, title)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) return;

    // Fetch actor profiles separately for notifications that have an actor.
    const actorIds = [
      ...new Set(
        (data as any[]).filter((n) => n.actor_id).map((n) => n.actor_id as string)
      ),
    ];
    let actorMap: Record<string, { id: string; username: string; display_name: string | null; avatar_url: string | null }> = {};
    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", actorIds);
      (actors ?? []).forEach((a: any) => { actorMap[a.id] = a; });
    }

    // Fetch comment bodies for comment notifications.
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
      actor: n.actor_id ? (actorMap[n.actor_id] ?? null) : null,
      comment_body: n.comment_id ? (bodyMap[n.comment_id] ?? null) : null,
      list: n.list ?? null,
    })) as NotificationRow[];

    setItems(enriched);
  }, [userId, supabase]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Fetch own username once (needed to build list_like URLs).
  useEffect(() => {
    supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single()
      .then(({ data }) => { if (data) setSelfUsername((data as any).username); });
  }, [userId, supabase]);

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
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems((prev) => prev.filter((n) => n.id !== (payload.old as any).id));
        }
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

  async function dismiss(ids: string[]) {
    // Delete first so the Realtime DELETE event (which removes from local state)
    // fires AFTER the row is actually gone — preventing the cleared-state race.
    await (supabase as any)
      .from("notifications")
      .delete()
      .in("id", ids)
      .eq("user_id", userId);
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
  }

  async function clearAll() {
    await (supabase as any)
      .from("notifications")
      .delete()
      .eq("user_id", userId);
    setItems([]);
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const unreadCount = items.filter((n) => !n.read).length;

  // Bunch reaction notifications by (review_id, emoji).
  // Legacy review_like notifications (pre-migration) are also bunched by review_id.
  const displayItems: DisplayItem[] = (() => {
    const result: DisplayItem[] = [];
    const reactionBunches: Record<string, BunchedReaction> = {};

    for (const n of items) {
      const isReaction = n.type === "review_reaction" || n.type === "review_like";
      if (isReaction && n.review_id) {
        const emoji = n.emoji ?? "❤️"; // legacy likes default to ❤️
        const key = `${n.review_id}:${emoji}`;
        if (reactionBunches[key]) {
          const bunch = reactionBunches[key];
          bunch.actors.push({
            username: n.actor?.username ?? "",
            display_name: n.actor?.display_name ?? null,
            avatar_url: n.actor?.avatar_url ?? null,
          });
          bunch.ids.push(n.id);
          if (!n.read) bunch.unread = true;
        } else {
          const bunch: BunchedReaction = {
            kind: "reaction_bunch",
            reviewId: n.review_id,
            gameTitle: (n.review?.games as any)?.title ?? "a game",
            gameSlug: (n.review?.games as any)?.slug ?? "",
            emoji,
            actors: [{
              username: n.actor?.username ?? "",
              display_name: n.actor?.display_name ?? null,
              avatar_url: n.actor?.avatar_url ?? null,
            }],
            unread: !n.read,
            latestId: n.id,
            ids: [n.id],
          };
          reactionBunches[key] = bunch;
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
            {items.length > 0 && (
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <>
                    <button
                      onClick={markAllRead}
                      className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                      Mark all read
                    </button>
                    <span className="text-zinc-700">·</span>
                  </>
                )}
                <button
                  onClick={clearAll}
                  className="text-xs text-zinc-500 transition-colors hover:text-red-400"
                >
                  Clear all
                </button>
              </div>
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
                item.kind === "reaction_bunch" ? (
                  <ReactionBunchRow
                    key={`bunch-${item.reviewId}-${item.emoji}`}
                    item={item}
                    onRead={() => markRead(item.ids)}
                    onClose={() => setOpen(false)}
                    onDismiss={() => dismiss(item.ids)}
                  />
                ) : (
                  <SingleRow
                    key={item.id}
                    item={item}
                    selfUsername={selfUsername}
                    onRead={() => markRead([item.id])}
                    onClose={() => setOpen(false)}
                    onDismiss={() => dismiss([item.id])}
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
  onDismiss,
  children,
}: {
  unread: boolean;
  href: string;
  onRead: () => void;
  onClose: () => void;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { onRead(); onClose(); router.push(href); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onRead(); onClose(); router.push(href); } }}
      className={`group/row cursor-pointer flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-900 ${unread ? "border-l-2 border-violet-500" : "border-l-2 border-transparent"}`}
    >
      {/* Content — items-start so avatar aligns to top for tall rows */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {children}
      </div>

      {/* Dismiss button — visible on row hover only */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-0 group-hover/row:opacity-100 rounded p-0.5 text-zinc-600 transition-all hover:text-red-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function Avatar({
  url,
  username,
  profileUsername,
}: {
  url: string | null;
  username: string;
  profileUsername?: string;
}) {
  const inner = url ? (
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

  if (!profileUsername) return inner;

  return (
    <Link
      href={`/user/${profileUsername}`}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0"
    >
      {inner}
    </Link>
  );
}

function SingleRow({
  item,
  selfUsername,
  onRead,
  onClose,
  onDismiss,
}: {
  item: SingleNotification;
  selfUsername: string | null;
  onRead: () => void;
  onClose: () => void;
  onDismiss: () => void;
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
        onDismiss={onDismiss}
      >
        <Avatar url={actor?.avatar_url ?? null} username={actor?.username ?? "?"} profileUsername={actor?.username} />
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
        onDismiss={onDismiss}
      >
        <Avatar url={actor?.avatar_url ?? null} username={actor?.username ?? "?"} profileUsername={actor?.username} />
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

  if (item.type === "welcome") {
    return (
      <RowWrapper
        unread={!item.read}
        href="/search"
        onRead={onRead}
        onClose={onClose}
        onDismiss={onDismiss}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
          W
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-zinc-300">
            <span className="font-medium text-white">Welcome to Waypoint!</span>{" "}
            Start logging games to build out your profile.
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">{timeAgo(item.created_at)}</p>
        </div>
      </RowWrapper>
    );
  }

  if (item.type === "list_like") {
    const listUrl =
      selfUsername && item.list_id
        ? `/user/${selfUsername}/lists/${item.list_id}`
        : "/";
    const listTitle = item.list?.title ?? null;

    return (
      <RowWrapper
        unread={!item.read}
        href={listUrl}
        onRead={onRead}
        onClose={onClose}
        onDismiss={onDismiss}
      >
        <Avatar url={actor?.avatar_url ?? null} username={actor?.username ?? "?"} profileUsername={actor?.username} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-zinc-300">
            <span className="font-medium text-white">{name}</span>{" "}
            liked your list
            {listTitle ? (
              <> <span className="font-medium text-white">&ldquo;{listTitle}&rdquo;</span></>
            ) : ""}.
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">{timeAgo(item.created_at)}</p>
        </div>
      </RowWrapper>
    );
  }

  // Fallback (shouldn't reach here for reaction likes — those are bunched)
  return null;
}

function ReactionBunchRow({
  item,
  onRead,
  onClose,
  onDismiss,
}: {
  item: BunchedReaction;
  onRead: () => void;
  onClose: () => void;
  onDismiss: () => void;
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
      href={item.gameSlug ? `/review/${item.reviewId}` : "/"}
      onRead={onRead}
      onClose={onClose}
      onDismiss={onDismiss}
    >
      {/* Stack up to 2 avatars */}
      <div className="relative h-8 shrink-0" style={{ width: item.actors.length > 1 ? "44px" : "32px" }}>
        {item.actors.slice(0, 2).map((a, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: i === 0 ? 0 : 12, zIndex: 2 - i }}
          >
            <Avatar url={a.avatar_url} username={a.username} profileUsername={a.username || undefined} />
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-zinc-300">
          <span className="font-medium text-white">{actorText}</span>{" "}
          reacted {item.emoji} to your review of{" "}
          <span className="font-medium text-white">{item.gameTitle}</span>.
        </p>
      </div>
    </RowWrapper>
  );
}
