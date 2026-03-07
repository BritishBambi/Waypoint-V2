"use client";

// ReviewActions — owns the body/rating display for a single review and
// provides inline editing (textarea + StarPicker) and delete/confirm flows.
//
// Rendered by the review detail Server Component; receives all initial state
// as props so the page is SSR'd with no layout shift on first load.

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LikeButton } from "./LikeButton";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  reviewId: string;
  userId: string | null;     // currently logged-in viewer
  isOwner: boolean;          // viewer === review author
  initialBody: string | null;
  initialRating: number;
  initialIsSpoiler: boolean;
  initialIsPinned: boolean;
  gameSlug: string;
  startEditing: boolean;     // true when ?edit=true is in the URL
  likeCount: number;
  userHasLiked: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewActions({
  reviewId,
  userId,
  isOwner,
  initialBody,
  initialRating,
  initialIsSpoiler,
  initialIsPinned,
  gameSlug,
  startEditing,
  likeCount,
  userHasLiked,
}: Props) {
  const [mode, setMode] = useState<"read" | "edit" | "confirm-delete">(
    isOwner && startEditing ? "edit" : "read"
  );
  const [body, setBody]         = useState(initialBody ?? "");
  const [rating, setRating]     = useState(initialRating);
  const [isSpoiler, setIsSpoiler] = useState(initialIsSpoiler);
  const [isPinned, setIsPinned] = useState(initialIsPinned);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function save() {
    if (rating === 0) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await (supabase as any)
      .from("reviews")
      .update({
        body: body.trim() || null,
        rating,
        is_spoiler: isSpoiler,
        updated_at: new Date().toISOString(),
      })
      // Ownership enforced at the query level — not just frontend
      .eq("id", reviewId)
      .eq("user_id", userId!);

    if (error) {
      setSaving(false);
      return;
    }
    setMode("read");
    setSaving(false);
    showToast("Review updated");
    router.refresh();
  }

  async function doDelete() {
    setDeleting(true);
    const supabase = createClient();
    await (supabase as any)
      .from("reviews")
      .delete()
      .eq("id", reviewId)
      .eq("user_id", userId!); // ownership enforced

    showToast("Review deleted");
    setTimeout(() => router.push(`/games/${gameSlug}`), 600);
  }

  async function handlePin() {
    const supabase = createClient();
    const newFeaturedId = isPinned ? null : reviewId;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ featured_review_id: newFeaturedId })
      .eq("id", userId!);
    if (!error) {
      setIsPinned(!isPinned);
      showToast(isPinned ? "Removed from showcase" : "Pinned to showcase ✦");
    }
  }

  // ─── Read view ─────────────────────────────────────────────────────────────

  if (mode === "read") {
    return (
      <>
        {/* Star rating (static display) */}
        <div className="mb-5 flex items-center gap-1.5">
          <StarFilledIcon className="h-5 w-5 fill-yellow-400 text-yellow-400" />
          <span className="text-xl font-bold text-white">{rating}</span>
          <span className="text-sm text-zinc-500">/5</span>
        </div>

        {/* Body */}
        {isSpoiler ? (
          <SpoilerBody body={body || null} />
        ) : body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 sm:text-base">
            {body}
          </p>
        ) : (
          <p className="text-sm italic text-zinc-600">No written review.</p>
        )}

        {/* Bottom action bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-5">
          <LikeButton
            reviewId={reviewId}
            userId={userId}
            initialCount={likeCount}
            initialLiked={userHasLiked}
          />

          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePin}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  isPinned
                    ? "border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                }`}
              >
                ✦ {isPinned ? "Pinned to showcase" : "Pin to showcase"}
              </button>
              <button
                onClick={() => setMode("edit")}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => setMode("confirm-delete")}
                className="flex items-center gap-1.5 rounded-lg border border-red-900/40 px-3 py-1.5 text-sm text-red-500 transition-colors hover:border-red-700/60 hover:bg-red-950/30 hover:text-red-400"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>

        {toast && <Toast msg={toast} />}
      </>
    );
  }

  // ─── Edit view ─────────────────────────────────────────────────────────────

  if (mode === "edit") {
    return (
      <>
        {/* Star picker */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            Rating <span className="text-red-400">*</span>
          </label>
          <StarPicker value={rating} onChange={setRating} />
        </div>

        {/* Textarea */}
        <div className="mb-4">
          <label
            htmlFor="edit-review-body"
            className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
          >
            Review
          </label>
          <textarea
            id="edit-review-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={10000}
            autoFocus
            placeholder="Share your thoughts…"
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Spoiler toggle */}
        <div className="mb-5">
          <label className="flex cursor-pointer select-none items-center gap-2 group">
            <div
              onClick={() => setIsSpoiler(!isSpoiler)}
              className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${isSpoiler ? "bg-violet-600" : "bg-zinc-700"}`}
            >
              <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${isSpoiler ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-zinc-400 transition-colors group-hover:text-zinc-300">This review contains spoilers</span>
          </label>
        </div>

        {/* Save / Cancel */}
        <div className="flex items-center gap-3 border-t border-zinc-800 pt-5">
          <button
            onClick={save}
            disabled={saving || rating === 0}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => { setBody(initialBody ?? ""); setRating(initialRating); setIsSpoiler(initialIsSpoiler); setMode("read"); }}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Cancel
          </button>
        </div>

        {toast && <Toast msg={toast} />}
      </>
    );
  }

  // ─── Confirm-delete view ───────────────────────────────────────────────────

  return (
    <>
      {/* Keep body visible behind the confirmation */}
      {body ? (
        <p className="mb-5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300/50 sm:text-base">
          {body}
        </p>
      ) : null}

      <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-5">
        <p className="text-sm font-medium text-zinc-200">
          Are you sure you want to delete this review?
        </p>
        <p className="mt-1 text-sm text-zinc-500">This cannot be undone.</p>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={doDelete}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={() => setMode("read")}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast} />}
    </>
  );
}

// ─── SpoilerBody ──────────────────────────────────────────────────────────────

function SpoilerBody({ body }: { body: string | null }) {
  const [revealed, setRevealed] = useState(false);
  if (!body) return <p className="text-sm italic text-zinc-600">No written review.</p>;
  return (
    <>
      <div className="relative">
        <p className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 transition-[filter] sm:text-base ${revealed ? "" : "blur-sm select-none"}`}>
          {body}
        </p>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center rounded-lg text-sm font-medium text-zinc-300 transition-colors hover:text-white"
          >
            ⚠️ Spoiler — click to reveal
          </button>
        )}
      </div>
      {revealed && (
        <button
          onClick={() => setRevealed(false)}
          className="mt-2 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
        >
          hide spoiler
        </button>
      )}
    </>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-2xl"
      role="status"
      aria-live="polite"
    >
      {msg}
    </div>
  );
}

// ─── StarPicker ───────────────────────────────────────────────────────────────
// 5-star picker with half-star increments. Identical to the one in
// ReviewSection.tsx — duplicated here to avoid cross-route imports.

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
        <div key={i} className="relative" onMouseLeave={() => setHovered(0)}>
          <StarSvg state={starState(i)} clipId={`${uid}-${i}`} />
          <button
            type="button"
            aria-label={`Rate ${i - 0.5} out of 5`}
            className="absolute inset-0 w-1/2 cursor-pointer"
            onClick={() => onChange(value === i - 0.5 ? 0 : i - 0.5)}
            onMouseEnter={() => setHovered(i - 0.5)}
          />
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

function StarSvg({ state, clipId }: { state: "full" | "half" | "empty"; clipId: string }) {
  const POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";
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
        <defs><clipPath id={clipId}><rect x="0" y="0" width="12" height="24" /></clipPath></defs>
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function StarFilledIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
