"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { igdbCover } from "@/lib/igdb";
import { formatStatus } from "@/lib/formatStatus";
import { formatPlaytime } from "@/lib/formatPlaytime";
import { toast } from "@/lib/toast";
import type { LogWithGame } from "./page";
import { STATUS_BADGE } from "@/lib/statusBadge";

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { label: "All",       value: null as string | null },
  { label: "Playing",   value: "playing" },
  { label: "Completed", value: "played" },
  { label: "Dropped",   value: "dropped" },
  { label: "Backlog",   value: "backlog" },
];

// ─── LibraryGrid ──────────────────────────────────────────────────────────────

interface Props {
  logs: LogWithGame[];
  isOwnLibrary: boolean;
  userId: string | null;
  steamPlaytime?: Record<number, number>;
}

export function LibraryGrid({ logs, isOwnLibrary, userId, steamPlaytime }: Props) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Local notes state — allows optimistic updates without a full page reload.
  const [localNotes, setLocalNotes] = useState<Record<string, string | null>>(
    () => Object.fromEntries(logs.map((l) => [l.id, l.notes]))
  );
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);

  const filtered = activeFilter
    ? logs.filter((l) => l.status === activeFilter)
    : logs;

  async function handleNoteSave(logId: string) {
    const trimmed = editValue.trim() || null;
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await (supabase as any)
      .from("game_logs")
      .update({ notes: trimmed })
      .eq("id", logId);
    setIsSaving(false);
    if (error) { toast(`Could not save note: ${error.message}`, "error"); return; }
    setLocalNotes((prev) => ({ ...prev, [logId]: trimmed }));
    setEditingId(null);
    router.refresh();
  }

  async function handleNoteDelete(logId: string) {
    const supabase = createClient();
    await (supabase as any).from("game_logs").update({ notes: null }).eq("id", logId);
    setLocalNotes((prev) => ({ ...prev, [logId]: null }));
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div>
      {/* ── Status filter tabs ──────────────────────────────────────────────── */}
      <div className="mb-6 flex overflow-x-auto whitespace-nowrap border-b border-zinc-800">
        {FILTER_TABS.map(({ label, value }) => {
          const count = value
            ? logs.filter((l) => l.status === value).length
            : logs.length;
          const isActive = activeFilter === value;
          return (
            <button
              key={label}
              onClick={() => setActiveFilter(value)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "border-violet-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
              <span className="text-xs text-zinc-600">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
          No games with this status.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {filtered.map(({ id, status, games, reviews }) => {
            if (!games) return null;
            const review   = (reviews ?? [])[0] ?? null;
            const rating   = review?.rating ?? null;
            const noteText = isOwnLibrary ? (localNotes[id] ?? null) : null;
            const isEditing  = editingId  === id;
            const isDeleting = deletingId === id;

            return (
              <div key={id} className="group flex flex-col gap-1.5">

                {/* ── Cover area ─────────────────────────────────────────── */}
                {/* group/note on outer wrapper so the tooltip can escape overflow-hidden */}
                <div className="group group/note relative">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800">

                  {/* Cover image */}
                  <Link href={`/games/${games.slug}`} className="block h-full">
                    {games.cover_url ? (
                      <Image
                        src={igdbCover(games.cover_url, "t_720p")!}
                        alt={games.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                        quality={90}
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <NoCover />
                    )}
                  </Link>

                  {/* Rating — bottom right */}
                  {rating != null && (
                    <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400" aria-hidden="true">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span className="text-[10px] font-medium text-yellow-400">{rating}</span>
                    </div>
                  )}

                  {/* Playtime — bottom right (only when no rating) */}
                  {rating == null && games && steamPlaytime?.[games.id] != null && steamPlaytime[games.id] > 0 && (
                    <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="text-[10px] text-white/70">{formatPlaytime(steamPlaytime[games.id])}</span>
                    </div>
                  )}

                  {/* Review bubble — bottom left (takes priority over note icon) */}
                  {review && (
                    <Link
                      href={`/review/${review.id}`}
                      title="View review"
                      className="absolute bottom-1.5 left-1.5 z-10 flex items-center justify-center rounded-full bg-black/60 p-1 backdrop-blur-sm transition-colors hover:bg-black/80"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </Link>
                  )}

                </div>

                {/* Note icon — sibling of overflow-hidden so it receives hover events */}
                {!review && noteText && (
                  <div className="absolute bottom-1.5 left-1.5 z-10 flex items-center justify-center rounded-full bg-black/60 p-1 backdrop-blur-sm">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                )}

                {/* Tooltip — sibling of overflow-hidden so it is not clipped */}
                {!review && noteText && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[200px] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover/note:opacity-100">
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs leading-relaxed text-zinc-300 shadow-lg whitespace-normal">
                      {noteText.length > 80 ? noteText.slice(0, 80) + "…" : noteText}
                    </div>
                    <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
                  </div>
                )}
                </div>

                {/* Title */}
                <Link
                  href={`/games/${games.slug}`}
                  className="line-clamp-1 text-xs font-medium text-zinc-300 transition-colors group-hover:text-white"
                >
                  {games.title}
                </Link>

                {/* Status badge */}
                <span className={`self-start rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.shelved}`}>
                  {formatStatus(status)}
                </span>

                {/* ── Notes section (own library only) ───────────────────── */}
                {isOwnLibrary && (
                  <>
                    {/* Inline edit textarea */}
                    {isEditing && (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={2}
                          maxLength={5000}
                          autoFocus
                          className="w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleNoteSave(id)}
                            disabled={isSaving}
                            className="rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                          >
                            {isSaving ? "…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded px-3 py-2 text-xs text-zinc-500 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Notes preview with edit/delete — hidden while editing */}
                    {!isEditing && noteText && (
                      <div className="group/noterow flex items-start gap-1">
                        {isDeleting ? (
                          /* Delete confirm */
                          <div className="flex flex-wrap items-center gap-1 text-[10px]">
                            <span className="text-zinc-500">Remove?</span>
                            <button onClick={() => handleNoteDelete(id)} className="text-red-400 hover:text-red-300">Yes</button>
                            <button onClick={() => setDeletingId(null)} className="text-zinc-600 hover:text-zinc-400">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <p className="min-w-0 flex-1 truncate text-xs italic text-white/40">
                              📝 &ldquo;{noteText}&rdquo;
                            </p>
                            <div className="flex shrink-0 items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover/noterow:opacity-100">
                              <button
                                onClick={() => { setEditingId(id); setEditValue(noteText); }}
                                title="Edit note"
                                className="text-white/30 transition-colors hover:text-white/70"
                                aria-label="Edit note"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setDeletingId(id)}
                                title="Delete note"
                                className="text-white/30 transition-colors hover:text-white/70"
                                aria-label="Delete note"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                  <path d="M10 11v6M14 11v6" />
                                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NoCover() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600" aria-hidden="true">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 12h4M8 10v4" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="18" cy="12" r="1" />
      </svg>
    </div>
  );
}
