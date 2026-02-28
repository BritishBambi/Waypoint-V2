"use client";

// GameLogSection — the "Log this Game" button and the modal it opens.
// This is a Client Component because it owns interactive state (modal open/close,
// form fields, Supabase mutations).
//
// After a successful save we call router.refresh() so the Server Component
// re-renders and the ReviewSection receives the updated existingLog prop.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LogSummary } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Game {
  id: number;
  title: string;
  slug: string;
  cover_url: string | null;
}

const STATUSES = [
  { value: "playing",  label: "Playing" },
  { value: "played",   label: "Played" },
  { value: "wishlist", label: "Wishlist" },
  { value: "dropped",  label: "Dropped" },
] as const;

type Status = (typeof STATUSES)[number]["value"];

const STATUS_BADGE: Record<string, string> = {
  playing:  "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  played:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  wishlist: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  dropped:  "bg-red-500/20 text-red-300 border-red-500/40",
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
  const [log, setLog] = useState<LogSummary | null>(existingLog);
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <>
      {log ? (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-4 py-1 text-sm font-medium ${STATUS_BADGE[log.status] ?? STATUS_BADGE.shelved}`}
          >
            {STATUSES.find((s) => s.value === log.status)?.label ?? log.status}
          </span>
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Edit Log
          </button>
        </div>
      ) : (
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
          Log this Game
        </button>
      )}

      {isOpen && (
        <LogModal
          game={game}
          userId={userId}
          existingLog={log}
          onClose={() => setIsOpen(false)}
          onSaved={(newLog) => {
            setLog(newLog);
            setIsOpen(false);
            // Refresh the Server Component so ReviewSection gets the new log id.
            router.refresh();
          }}
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
  onClose: () => void;
  onSaved: (log: LogSummary) => void;
}

function LogModal({ game, userId, existingLog, onClose, onSaved }: ModalProps) {
  const [status, setStatus] = useState<Status>(
    (existingLog?.status as Status) ?? "played"
  );
  const [rating, setRating] = useState(0);   // 0 = no rating
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    const supabase = createClient();
    let logId = existingLog?.id;

    if (existingLog) {
      // Update status on the existing log.
      const { error: updateErr } = await supabase
        .from("game_logs")
        .update({ status })
        .eq("id", existingLog.id);

      if (updateErr) {
        setError(updateErr.message);
        setIsSaving(false);
        return;
      }
    } else {
      // Create a new log.
      const { data, error: insertErr } = await supabase
        .from("game_logs")
        .insert({ user_id: userId, game_id: game.id, status })
        .select("id")
        .single();

      if (insertErr) {
        setError(insertErr.message);
        setIsSaving(false);
        return;
      }

      logId = data.id;
    }

    // Insert a diary entry when the user provided a note and/or a rating.
    // diary_entries.body is NOT NULL — use an empty string if only a rating
    // was provided so the entry still records the user's score.
    if (note.trim() || rating > 0) {
      const { error: diaryErr } = await supabase.from("diary_entries").insert({
        log_id: logId!,
        user_id: userId,
        body: note.trim() || "",
        rating: rating > 0 ? rating : null,
        play_date: new Date().toISOString().split("T")[0],
      });

      if (diaryErr) {
        // Non-fatal: the log was saved. Surface as a warning.
        console.error("Diary entry error:", diaryErr.message);
      }
    }

    onSaved({ id: logId!, status });
  }

  return (
    // Backdrop — click outside to close.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {existingLog ? "Edit Log" : "Log this Game"}
          </h2>
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

          {/* Game title */}
          <p className="text-sm text-zinc-400">
            <span className="font-medium text-white">{game.title}</span>
          </p>

          {/* Status selector */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUSES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
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

          {/* Rating (optional) */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Your Rating <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          {/* Diary note (optional) */}
          <div>
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
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

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
// 10-star rating picker. Clicking the active star deselects (rating becomes 0).

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => {
        const filled = hovered ? star <= hovered : star <= value;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star === value ? 0 : star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="p-0.5 text-yellow-400 transition-transform hover:scale-110"
            aria-label={`Rate ${star} out of 10`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={filled ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-2 text-sm text-zinc-400">{value}/10</span>
      )}
    </div>
  );
}
