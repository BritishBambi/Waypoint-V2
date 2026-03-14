"use client";

// CommentsSection — shows comments on a review and lets logged-in users post,
// delete, and reply to comments. Replies are visually indented one level.
// @username mentions in body text are highlighted and linked.

import Image from "next/image";
import Link from "next/link";
import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ReviewComment } from "./page";

interface Props {
  reviewId: string;
  userId: string | null;
  initialComments: ReviewComment[];
}

// Highlights @username tokens in comment body with violet text linked to profile.
function renderBody(text: string): React.ReactNode {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      const username = part.slice(1);
      return (
        <Link
          key={i}
          href={`/user/${username}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-violet-400 hover:text-violet-300"
        >
          {part}
        </Link>
      );
    }
    return part;
  });
}

export function CommentsSection({ reviewId, userId, initialComments }: Props) {
  const [comments, setComments]   = useState<ReviewComment[]>(initialComments);
  const [body, setBody]           = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [replyTo, setReplyTo]     = useState<{ id: string; username: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleReply(commentId: string, username: string) {
    setReplyTo({ id: commentId, username });
    setBody(`@${username} `);
    setTimeout(() => {
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    }, 50);
  }

  function cancelReply() {
    if (replyTo && body.startsWith(`@${replyTo.username} `)) {
      setBody(body.slice(replyTo.username.length + 2));
    }
    setReplyTo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !userId) return;

    setIsPosting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertErr } = await (supabase as any)
      .from("review_comments")
      .insert({
        review_id: reviewId,
        user_id: userId,
        body: trimmed,
        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
      })
      .select("id, review_id, user_id, body, created_at, reply_to_id, profiles(username, display_name, avatar_url, active_title:titles!active_title_id(name, color, steam_app_id))")
      .maybeSingle();

    if (insertErr) {
      setError(insertErr.message);
    } else if (data) {
      setComments((prev) => [...prev, data as ReviewComment]);
      setBody("");
      setReplyTo(null);
    }

    setIsPosting(false);
  }

  async function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));

    const supabase = createClient();
    const { error: deleteErr } = await (supabase as any)
      .from("review_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", userId);

    if (deleteErr) {
      const { data } = await (supabase as any)
        .from("review_comments")
        .select("id, review_id, user_id, body, created_at, reply_to_id, profiles(username, display_name, avatar_url, active_title:titles!active_title_id(name, color, steam_app_id))")
        .eq("review_id", reviewId)
        .order("created_at", { ascending: true });
      if (data) setComments(data as ReviewComment[]);
    }
  }

  return (
    <section>
      <h2 className="mb-5 text-lg font-bold text-white">
        Comments
        {comments.length > 0 && (
          <span className="ml-2 text-base font-normal text-zinc-500">
            ({comments.length})
          </span>
        )}
      </h2>

      {/* Comment list */}
      {comments.length > 0 ? (
        <div className="mb-6 space-y-3">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              currentUserId={userId}
              onDelete={handleDelete}
              onReply={handleReply}
            />
          ))}
        </div>
      ) : (
        <p className="mb-6 text-sm text-zinc-500">No comments yet.</p>
      )}

      {/* Comment form / login prompt */}
      {userId ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
        >
          {/* Replying-to banner */}
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-1.5">
              <span className="text-xs text-zinc-400">
                Replying to{" "}
                <span className="font-medium text-violet-400">@{replyTo.username}</span>
              </span>
              <button
                type="button"
                onClick={cancelReply}
                aria-label="Cancel reply"
                className="ml-2 rounded p-0.5 text-zinc-500 transition-colors hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={replyTo ? `Reply to @${replyTo.username}…` : "Leave a comment…"}
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <div className="mt-2 flex items-center justify-between gap-4">
            <span
              className={`text-xs ${
                body.length >= 450 ? "text-orange-400" : "text-zinc-600"
              }`}
            >
              {body.length}/500
            </span>
            {error && (
              <p className="flex-1 truncate text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={isPosting || !body.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isPosting ? "Posting…" : replyTo ? "Post Reply" : "Post Comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-500">
          <Link
            href="/login"
            className="text-indigo-400 transition-colors hover:text-indigo-300"
          >
            Log in
          </Link>{" "}
          to leave a comment.
        </p>
      )}
    </section>
  );
}

// ─── CommentCard ──────────────────────────────────────────────────────────────

function CommentCard({
  comment,
  currentUserId,
  onDelete,
  onReply,
}: {
  comment: ReviewComment;
  currentUserId: string | null;
  onDelete: (id: string) => void;
  onReply: (id: string, username: string) => void;
}) {
  const author = comment.profiles;
  const displayName = author?.display_name ?? author?.username ?? "Anonymous";
  const isOwn = currentUserId === comment.user_id;
  const isReply = comment.reply_to_id !== null;

  const dateStr = new Date(comment.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      id={`comment-${comment.id}`}
      className={`group flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${isReply ? "ml-10" : ""}`}
    >
      {/* Avatar → user profile */}
      {author?.username ? (
        <Link href={`/user/${author.username}`} className="shrink-0">
          <div className="relative h-8 w-8 overflow-hidden rounded-full bg-zinc-700">
            {author?.avatar_url ? (
              <Image
                src={author.avatar_url}
                alt={displayName}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-400">
                {displayName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        </Link>
      ) : (
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-700">
          <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-400">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Meta row */}
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2">
            {author?.username ? (
              <Link href={`/user/${author.username}`} className="text-sm font-medium text-white hover:underline">
                {displayName}
              </Link>
            ) : (
              <span className="text-sm font-medium text-white">{displayName}</span>
            )}
            {(author as any)?.active_title?.steam_app_id && (
              <div className="h-3.5 w-3.5 rounded-full overflow-hidden flex-shrink-0" title={(author as any).active_title.name}>
                <img
                  src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${(author as any).active_title.steam_app_id}/header.jpg`}
                  alt={(author as any).active_title.name}
                  className="w-full h-full object-cover object-center"
                />
              </div>
            )}
            {author?.username && (
              <Link href={`/user/${author.username}`} className="text-xs text-zinc-500 hover:text-zinc-300">
                @{author.username}
              </Link>
            )}
            <span className="text-xs text-zinc-600">{dateStr}</span>
          </div>

          {/* Action buttons — Reply (always, if logged in) + Delete (own only) */}
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {currentUserId && author?.username && (
              <button
                type="button"
                onClick={() => onReply(comment.id, author.username!)}
                className="rounded px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                Reply
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => onDelete(comment.id)}
                aria-label="Delete comment"
                className="rounded p-0.5 text-zinc-600 transition-colors hover:text-red-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm text-zinc-300">
          {renderBody(comment.body)}
        </p>
      </div>
    </div>
  );
}
