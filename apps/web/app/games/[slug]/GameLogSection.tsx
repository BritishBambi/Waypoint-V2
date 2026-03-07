"use client";

// GameLogSection — the "Log this Game" button and the modal it opens.
//
// State is managed by useGameLog (TanStack Query) rather than plain useState,
// so the button updates reactively and we can invalidate the cache after a save
// without calling router.refresh() for this subtree.
//
// After a successful save we still call router.refresh() so the Server Component
// re-renders and ReviewSection receives the updated existingLog prop (it lives
// outside the TanStack Query boundary).

import { useState, useMemo } from "react";
import { useId } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useGameLog, gameLogKey } from "@waypoint/api-client";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { formatStatus } from "@/lib/formatStatus";
import type { LogSummary } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

// Full game shape needed for the existence check + edge-function fallback.
interface Game {
  id: number;
  title: string;
  slug: string;
  cover_url: string | null;
  summary: string | null;
  genres: string[] | null;
  platforms: string[] | null;
  release_date: string | null;
  igdb_rating: number | null;
}

const STATUSES = [
  { value: "playing",  label: "Playing" },
  { value: "played",   label: "Completed" },
  { value: "dropped",  label: "Dropped" },
  { value: "backlog",  label: "Backlog" },
  { value: "wishlist", label: "Wishlist" },
] as const;

type Status = (typeof STATUSES)[number]["value"];

const STATUS_BADGE: Record<string, string> = {
  playing:  "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  played:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  wishlist: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  dropped:  "bg-red-500/20 text-red-300 border-red-500/40",
  backlog:  "bg-sky-500/20 text-sky-300 border-sky-500/40",
  shelved:  "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
};

// ─── GameLogSection ───────────────────────────────────────────────────────────

interface Props {
  game: Game;
  userId: string | null;
  existingLog: LogSummary | null;
}

export function GameLogSection({ game, userId, existingLog }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const isUnreleased =
    game.release_date != null &&
    new Date(game.release_date).getTime() > Date.now();

  // Create the auth-aware browser client once. createBrowserClient (from
  // @supabase/ssr) returns a singleton internally, so this is safe to call
  // at component level and pass as a stable reference.
  const supabase = useMemo(() => createClient(), []);

  // useGameLog seeds the cache from SSR data (existingLog) so the button
  // renders immediately with no loading flash. It re-fetches in the background
  // to stay in sync, and is updated optimistically after a save.
  const { data: log } = useGameLog(supabase, game.id, userId, existingLog);

  if (!userId) {
    return (
      <a
        href="/login"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
      >
        Sign in to log this game
      </a>
    );
  }

  function handleSaved(newLog: LogSummary | null) {
    // Optimistically update the cache so the button reflects the new status
    // without waiting for a refetch.
    queryClient.setQueryData(gameLogKey(game.id, userId!), newLog ?? undefined);
    // Schedule a background refetch to confirm the data is consistent.
    queryClient.invalidateQueries({ queryKey: gameLogKey(game.id, userId!) });
    setIsOpen(false);
    // Refresh the Server Component subtree so ReviewSection gets the updated log.
    router.refresh();
  }

  return (
    <>
      {log ? (
        // ── Logged state: single pill-button showing status + "Edit" ──────────
        <button
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors hover:brightness-110 ${STATUS_BADGE[log.status] ?? STATUS_BADGE.shelved}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {isUnreleased && log.status === "wishlist" ? "Wishlisted" : formatStatus(log.status)}
          <span className="text-current opacity-60">· Edit</span>
        </button>
      ) : (
        // ── Unlogged state: primary CTA button ────────────────────────────────
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {isUnreleased ? "Add to Wishlist" : "Log this Game"}
        </button>
      )}

      {isOpen && (
        <LogModal
          game={game}
          userId={userId}
          existingLog={log ?? null}
          isUnreleased={isUnreleased}
          onClose={() => setIsOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

// ─── LogModal ─────────────────────────────────────────────────────────────────

interface ModalProps {
  game: Game;
  userId: string;
  existingLog: LogSummary | null;
  isUnreleased: boolean;
  onClose: () => void;
  onSaved: (log: LogSummary | null) => void;
}

function LogModal({ game, userId, existingLog, isUnreleased, onClose, onSaved }: ModalProps) {
  const visibleStatuses = isUnreleased
    ? STATUSES.filter((s) => s.value === "wishlist")
    : STATUSES;

  const [status, setStatus] = useState<Status | null>(
    (existingLog?.status as Status) ?? (isUnreleased ? "wishlist" : null)
  );
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);

  const showRating = status === "playing" || status === "played";
  const showNotes = status === "playing" || status === "played" || status === "dropped";

  async function handleSave() {
    setIsSaving(true);

    // We always create the client fresh inside the mutation handler so it
    // has the latest auth session.
    const supabase = createClient();

    // ── Null status: remove game from library ─────────────────────────────
    //
    // If the user deselected all statuses, treat Save as "remove this game".
    // ON DELETE CASCADE on reviews and diary_entries cleans up child rows.
    // If there's no existing log (new modal, nothing ever selected), just close.
    if (status === null) {
      setIsSpoiler(false);
      if (existingLog) {
        const { error: deleteErr } = await (supabase as any)
          .from("game_logs")
          .delete()
          .eq("game_id", game.id)
          .eq("user_id", userId);

        if (deleteErr) {
          toast(`Could not remove game: ${deleteErr.message}`, "error");
          setIsSaving(false);
          return;
        }
        toast(`${game.title} removed from your library`);
        onSaved(null);
      } else {
        onClose();
      }
      return;
    }

    // ── Step 1: Ensure the game exists in the games table ──────────────────
    //
    // The igdb-game-detail edge function upserts the game on every page load
    // (using the service role, which bypasses the read-only RLS on `games`),
    // so in practice the game is always present by the time this runs.
    // This check is purely defensive — if for some reason the game is absent
    // (e.g. a very fast page load where the edge function hasn't completed),
    // we re-trigger the sync before trying to create the FK-constrained log row.
    const { data: existingGame } = await supabase
      .from("games")
      .select("id")
      .eq("id", game.id)
      .maybeSingle();

    if (!existingGame) {
      // Re-trigger the edge function, which upserts via the service role.
      // Direct insert is not possible here because the `games` RLS policy
      // only allows SELECT for regular users — all writes use the service role.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const syncRes = await fetch(`${supabaseUrl}/functions/v1/igdb-game-detail`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug: game.slug }),
      });
      if (!syncRes.ok) {
        toast(`Could not sync game data. Please try again.`, "error");
        setIsSaving(false);
        return;
      }
    }

    // ── Step 1.5: Ensure a profiles row exists for this user ──────────────
    //
    // game_logs.user_id has a FK → profiles(id). If the handle_new_user trigger
    // didn't fire when the account was created (e.g. the migration hadn't been
    // pushed yet, or the trigger failed silently on a username collision), there
    // will be no profiles row and the game_logs insert will violate the FK.
    //
    // The "profiles: insert own" RLS policy allows id = auth.uid(), so the user
    // can create their own profile row. We use maybeSingle() to check first and
    // only insert if missing — this is a no-op on every subsequent save.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      // Replicate exactly what handle_new_user does: id + deterministic username.
      const generatedUsername = "user_" + userId.replace(/-/g, "").slice(0, 12);
      const { error: profileErr } = await (supabase as any)
        .from("profiles")
        .insert({ id: userId, username: generatedUsername });

      if (profileErr) {
        toast(`Could not create profile: ${profileErr.message}`, "error");
        setIsSaving(false);
        return;
      }
    }

    // ── Step 2: Upsert game_logs ───────────────────────────────────────────
    //
    // Using upsert with onConflict on the unique (user_id, game_id) pair means
    // "create if new, update status if existing" — a single operation that
    // handles both the first log and every edit.
    const { data: logData, error: logErr } = await (supabase as any)
      .from("game_logs")
      .upsert(
        { user_id: userId, game_id: game.id, status },
        { onConflict: "user_id,game_id" }
      )
      .select("id")
      .single();

    if (logErr || !logData) {
      toast(logErr?.message ?? "Failed to save log.", "error");
      setIsSaving(false);
      return;
    }

    const logId = logData.id;

    // ── Step 3: Upsert review (if a rating or note was given) ─────────────
    //
    // reviews has UNIQUE (log_id), so upsert handles both "first review" and
    // "updating an existing review" without needing a separate lookup.
    // Gate on rating OR note — a note without a star rating is still a review.
    if (rating > 0 || note.trim()) {
      const { error: reviewErr } = await (supabase as any)
        .from("reviews")
        .upsert(
          {
            log_id: logId,
            user_id: userId,
            game_id: game.id,
            rating: rating > 0 ? rating : null,
            body: note.trim() || null,
            is_spoiler: isSpoiler,
            is_draft: false,
            published_at: new Date().toISOString(),
          },
          { onConflict: "log_id" }
        );

      if (reviewErr) {
        // Non-fatal — the log was saved. Surface as a warning.
        toast(`Log saved, but review could not be recorded: ${reviewErr.message}`, "error");
      }
    }

    // ── Step 4: Insert diary entry (if a note was written) ─────────────────
    //
    // Each save with a note creates a new diary entry (diary entries accumulate
    // over time; they are not updated like the log or review). We only insert
    // if there's actual text — silent on failure to avoid blocking the UX.
    if (note.trim()) {
      const { error: diaryErr } = await (supabase as any).from("diary_entries").insert({
        log_id: logId,
        user_id: userId,
        body: note.trim(),
        play_date: new Date().toISOString().split("T")[0],
      });

      if (diaryErr) {
        console.error("Diary entry error:", diaryErr.message);
      }
    }

    // ── Step 5: Success ────────────────────────────────────────────────────
    toast(`${game.title} logged!`);
    onSaved({ id: logId, status: status! });
    // isSaving intentionally left true — the modal closes immediately and
    // there's no point flashing the button back to "Save".
  }

  return (
    // Backdrop — click outside to close.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <p className="text-sm font-medium text-zinc-500">
            {existingLog ? "Edit Log" : "Log this Game"}
          </p>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:text-white"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 px-6 py-5">

          {/* Game title — h2-sized heading, not a form label */}
          <p className="text-xl font-bold text-white">{game.title}</p>

          {/* Status selector */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Status
            </label>
            <div className={`grid gap-2 ${visibleStatuses.length === 1 ? "grid-cols-1" : visibleStatuses.length >= 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
              {visibleStatuses.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const next = status === value ? null : value;
                    if (next === "wishlist" && note.trim()) {
                      setPendingStatus("wishlist");
                    } else {
                      setStatus(next);
                    }
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    status === value
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating (optional) — shown for Playing and Completed only */}
          <div className={`overflow-hidden transition-all duration-200 ${showRating ? "max-h-16 opacity-100" : "max-h-0 opacity-0"}`}>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Your Rating <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          {/* Diary note (optional) — hidden for Wishlist */}
          <div className={`overflow-hidden transition-all duration-200 ${showNotes ? "max-h-64 opacity-100" : "max-h-0 opacity-0"}`}>
            <label
              htmlFor="log-note"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
            >
              Notes <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <textarea
              id="log-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={5000}
              rows={3}
              placeholder="What did you think?"
              className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {note.trim() && showNotes && (
              <label className="mt-2.5 flex cursor-pointer select-none items-center gap-2 group">
                <div
                  onClick={() => setIsSpoiler(!isSpoiler)}
                  className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${isSpoiler ? "bg-violet-600" : "bg-zinc-700"}`}
                >
                  <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${isSpoiler ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm text-zinc-400 transition-colors group-hover:text-zinc-300">This review contains spoilers</span>
              </label>
            )}
          </div>
        </div>

        {/* Wishlist-switch warning dialog */}
        {pendingStatus !== null && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-zinc-900/95 p-6 backdrop-blur-sm">
            <div className="w-full max-w-xs space-y-4">
              <p className="text-sm leading-relaxed text-zinc-300">
                Switching to Wishlist will remove your rating and review. Continue?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingStatus(null)}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus(pendingStatus);
                    setNote("");
                    setRating(0);
                    setIsSpoiler(false);
                    setPendingStatus(null);
                  }}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  Yes, switch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
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
// Renders a single star in full / half / empty state.
// For "half", a <clipPath> inside the SVG's own <defs> clips the fill to the
// left 50% of the 24×24 viewBox (x < 12).

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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="text-yellow-400"
      >
        <polygon points={POINTS} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (state === "half") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
        {/* Empty outline */}
        <polygon points={POINTS} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-zinc-600" />
        {/* Left-half fill */}
        <polygon points={POINTS} fill="currentColor" clipPath={`url(#${clipId})`} className="text-yellow-400" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="text-zinc-600"
    >
      <polygon points={POINTS} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
