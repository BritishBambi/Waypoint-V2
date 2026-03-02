"use client";

// Shared form for creating and editing a list.
// Used by /lists/new and /user/[username]/lists/[id]/edit.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useGameSearch, type GameSearchResult } from "@waypoint/api-client";
import { createClient } from "@/lib/supabase/client";
import { igdbCover } from "@/lib/igdb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ListEntry = {
  game_id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  release_year: string | null;
  note: string;
};

interface ListFormProps {
  mode: "create" | "edit";
  listId?: string;
  username: string;
  initialData?: {
    title: string;
    description: string;
    is_public: boolean;
    is_ranked: boolean;
    entries: ListEntry[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ListForm({ mode, listId, username, initialData }: ListFormProps) {
  const router = useRouter();

  const [title, setTitle]           = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [isPublic, setIsPublic]     = useState(initialData?.is_public ?? true);
  const [isRanked, setIsRanked]     = useState(initialData?.is_ranked ?? false);
  const [entries, setEntries]       = useState<ListEntry[]>(initialData?.entries ?? []);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  // Note expansion: game_id of the entry whose note is currently expanded
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

  // Game search
  const [gameQuery, setGameQuery]     = useState("");
  const [showResults, setShowResults] = useState(false);
  const debouncedQuery = useDebounce(gameQuery, 400);
  const { results, isLoading: searchLoading } = useGameSearch(debouncedQuery);

  // Drag-and-drop state (ref avoids stale closure in onDragOver)
  const dragRef = useRef<number | null>(null);

  function addGame(game: GameSearchResult) {
    if (entries.some((e) => e.game_id === game.id)) return; // already in list
    setEntries((prev) => [
      ...prev,
      {
        game_id: game.id,
        slug: game.slug,
        title: game.title,
        cover_url: game.cover_url,
        release_year: game.release_date ? game.release_date.slice(0, 4) : null,
        note: "",
      },
    ]);
    setGameQuery("");
    setShowResults(false);
  }

  function removeGame(gameId: number) {
    setEntries((prev) => prev.filter((e) => e.game_id !== gameId));
    if (expandedNoteId === gameId) setExpandedNoteId(null);
  }

  function setNote(gameId: number, note: string) {
    setEntries((prev) => prev.map((e) => (e.game_id === gameId ? { ...e, note } : e)));
  }

  // ── Drag to reorder (ranked only) ──────────────────────────────────────────

  function onDragStart(index: number) {
    dragRef.current = index;
  }

  function onDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    const fromIndex = dragRef.current;
    if (fromIndex === null || fromIndex === targetIndex) return;
    setEntries((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(targetIndex, 0, moved);
      return arr;
    });
    dragRef.current = targetIndex;
  }

  function onDragEnd() {
    dragRef.current = null;
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setFormError("Title is required."); return; }
    setSaving(true);
    setFormError(null);

    try {
      const supabase = createClient();
      let finalListId = listId;

      if (mode === "create") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: newList, error: insertError } = await supabase
          .from("lists")
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            is_public: isPublic,
            is_ranked: isRanked,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        finalListId = (newList as { id: string }).id;
      } else {
        const { error: updateError } = await (supabase as any)
          .from("lists")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            is_public: isPublic,
            is_ranked: isRanked,
            updated_at: new Date().toISOString(),
          })
          .eq("id", listId);

        if (updateError) throw updateError;
      }

      // Ensure all games are in the DB before inserting FK-constrained entries.
      if (entries.length > 0) {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        await Promise.all(
          entries.map((e) =>
            fetch(`${base}/functions/v1/igdb-game-detail`, {
              method: "POST",
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ slug: e.slug }),
            })
          )
        );
      }

      // Replace entries: delete existing, then re-insert with updated positions.
      await supabase.from("list_entries").delete().eq("list_id", finalListId);

      if (entries.length > 0) {
        const { error: entriesError } = await supabase.from("list_entries").insert(
          entries.map((e, i) => ({
            list_id: finalListId,
            game_id: e.game_id,
            position: isRanked ? i + 1 : null,
            note: e.note.trim() || null,
          }))
        );
        if (entriesError) throw entriesError;
      }

      router.push(`/user/${username}/lists/${finalListId}`);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save list.");
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── Core fields ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* Title */}
        <div>
          <label htmlFor="list-title" className="block mb-1.5 text-sm font-medium text-zinc-300">
            Title <span className="text-rose-400">*</span>
          </label>
          <input
            id="list-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Top 10 RPGs of All Time"
            maxLength={100}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="list-desc" className="block mb-1.5 text-sm font-medium text-zinc-300">
            Description <span className="text-zinc-600">(optional)</span>
          </label>
          <textarea
            id="list-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this list about?"
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-zinc-300">Visibility</p>
            <ToggleGroup
              value={isPublic}
              onChange={setIsPublic}
              options={[
                { value: true,  label: "Public" },
                { value: false, label: "Private" },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-zinc-300">Type</p>
            <ToggleGroup
              value={isRanked}
              onChange={setIsRanked}
              options={[
                { value: false, label: "Unranked" },
                { value: true,  label: "Ranked" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Game search ──────────────────────────────────────────────────────── */}
      <div>
        <p className="mb-3 text-sm font-medium text-zinc-300">
          Games{entries.length > 0 && <span className="ml-1.5 text-zinc-500">({entries.length})</span>}
        </p>

        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={gameQuery}
            onChange={(e) => { setGameQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            placeholder="Search for a game to add…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-9 pr-4 text-sm text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />

          {/* Search results dropdown */}
          {showResults && debouncedQuery.trim().length >= 3 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
              {searchLoading ? (
                <div className="flex items-center justify-center py-6 text-sm text-zinc-500">
                  Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-zinc-500">
                  No games found
                </div>
              ) : (
                results.map((game) => {
                  const alreadyAdded = entries.some((e) => e.game_id === game.id);
                  return (
                    <button
                      key={game.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => addGame(game)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        alreadyAdded
                          ? "opacity-40 cursor-default"
                          : "hover:bg-zinc-900"
                      }`}
                    >
                      <div className="relative aspect-[2/3] w-8 shrink-0 overflow-hidden rounded bg-zinc-800">
                        {game.cover_url && (
                          <Image
                            src={igdbCover(game.cover_url, "t_cover_small")!}
                            alt={game.title}
                            fill
                            sizes="32px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{game.title}</p>
                        {game.release_date && (
                          <p className="text-xs text-zinc-500">{game.release_date.slice(0, 4)}</p>
                        )}
                      </div>
                      {alreadyAdded && (
                        <span className="shrink-0 text-xs text-zinc-600">Added</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Entries list ─────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <ul className="space-y-2" aria-label="Games in list">
          {entries.map((entry, index) => (
            <li
              key={entry.game_id}
              draggable={isRanked}
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={onDragEnd}
              className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3"
            >
              {/* Rank number or drag handle */}
              {isRanked && (
                <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
                  <span className="w-7 text-center text-sm font-bold text-zinc-600">
                    {index + 1}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="cursor-grab text-zinc-700 active:cursor-grabbing"
                    aria-hidden="true"
                  >
                    <path d="M9 6h6M9 12h6M9 18h6" />
                  </svg>
                </div>
              )}

              {/* Cover */}
              <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                {entry.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={igdbCover(entry.cover_url, "t_cover_small")!}
                    alt={entry.title}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              {/* Info + note */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{entry.title}</p>
                {entry.release_year && (
                  <p className="text-xs text-zinc-500">{entry.release_year}</p>
                )}

                {/* Note field */}
                {expandedNoteId === entry.game_id ? (
                  <textarea
                    value={entry.note}
                    onChange={(e) => setNote(entry.game_id, e.target.value)}
                    placeholder="Add a note about this game…"
                    maxLength={300}
                    rows={2}
                    autoFocus
                    className="mt-2 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  />
                ) : entry.note ? (
                  <button
                    type="button"
                    onClick={() => setExpandedNoteId(entry.game_id)}
                    className="mt-1.5 text-left text-xs italic text-zinc-400 hover:text-zinc-300"
                  >
                    &ldquo;{entry.note}&rdquo;
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpandedNoteId(entry.game_id)}
                    className="mt-1.5 text-xs text-zinc-600 hover:text-zinc-400"
                  >
                    + Add note
                  </button>
                )}
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeGame(entry.game_id)}
                aria-label={`Remove ${entry.title}`}
                className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
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
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── Error + Submit ────────────────────────────────────────────────────── */}
      {formError && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Create List" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
        >
          Cancel
        </button>
      </div>

    </form>
  );
}

// ─── ToggleGroup ──────────────────────────────────────────────────────────────

function ToggleGroup<T extends boolean>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (val: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-violet-600 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
