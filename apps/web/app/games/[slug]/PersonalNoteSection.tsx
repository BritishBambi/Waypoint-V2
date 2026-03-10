"use client";

// PersonalNoteSection — inline display, edit, and delete of a user's private
// game note on the game detail page. Only rendered when a note exists (SSR).
// Manages its own local state so edits/deletes reflect immediately without
// waiting for a full server re-render (though router.refresh() is called after
// each mutation to keep the server state in sync).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeDate } from "@/lib/formatDate";
import { toast } from "@/lib/toast";

interface Props {
  gameId: number;
  userId: string;
  initialNotes: string;
  initialUpdatedAt: string;
}

export function PersonalNoteSection({ gameId, userId, initialNotes, initialUpdatedAt }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [mode, setMode] = useState<"view" | "edit" | "delete-confirm">("view");
  const [editValue, setEditValue] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);

  // Hidden once deleted — component self-hides so the parent section disappears
  // without requiring a full server re-render.
  if (!notes) return null;

  async function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed) {
      // Treat saving empty note as delete
      await handleDelete();
      return;
    }
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await (supabase as any)
      .from("game_logs")
      .update({ notes: trimmed })
      .eq("game_id", gameId)
      .eq("user_id", userId);
    setIsSaving(false);
    if (error) {
      toast(`Could not save note: ${error.message}`, "error");
      return;
    }
    setNotes(trimmed);
    setUpdatedAt(new Date().toISOString());
    setMode("view");
    router.refresh();
  }

  async function handleDelete() {
    const supabase = createClient();
    await (supabase as any)
      .from("game_logs")
      .update({ notes: null })
      .eq("game_id", gameId)
      .eq("user_id", userId);
    setNotes("");
    setMode("view");
    router.refresh();
  }

  return (
    <div className="max-w-prose rounded-xl border border-white/5 bg-white/[0.03] px-5 py-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/40">
        <span aria-hidden="true">📝</span>
        My Notes
      </p>

      {mode === "edit" ? (
        /* ── Edit mode ─────────────────────────────────────────────────────── */
        <div className="flex flex-col gap-2">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            maxLength={5000}
            autoFocus
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditValue(notes); setMode("view"); }}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === "delete-confirm" ? (
        /* ── Delete confirm ────────────────────────────────────────────────── */
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">Remove this note?</span>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-600/20 px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
          >
            Yes, remove
          </button>
          <button
            onClick={() => setMode("view")}
            className="text-xs text-zinc-600 hover:text-zinc-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* ── View mode ─────────────────────────────────────────────────────── */
        <>
          <p className="text-sm italic leading-relaxed text-white/70">
            &ldquo;{notes}&rdquo;
          </p>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-xs text-white/30">
              Last updated {formatRelativeDate(updatedAt)}
            </p>
            <div className="flex items-center gap-2">
              {/* Edit */}
              <button
                onClick={() => { setEditValue(notes); setMode("edit"); }}
                title="Edit note"
                className="text-white/30 transition-colors hover:text-white/70"
                aria-label="Edit note"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              {/* Delete */}
              <button
                onClick={() => setMode("delete-confirm")}
                title="Delete note"
                className="text-white/30 transition-colors hover:text-white/70"
                aria-label="Delete note"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
