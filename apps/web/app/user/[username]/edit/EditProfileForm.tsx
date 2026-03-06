"use client";

// apps/web/app/user/[username]/edit/EditProfileForm.tsx
// Full edit-profile form. Handles:
//   - Display name / username / bio / website
//   - Avatar upload (Supabase Storage)
//   - Favourite games: drag-to-reorder, search modal, remove

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { createClient } from "@/lib/supabase/client";
import { useGameSearch, type GameSearchResult } from "@waypoint/api-client";
import { igdbCover } from "@/lib/igdb";
import type { Tables } from "@waypoint/types";

type Profile = Tables<"profiles">;

// A minimal game shape used for the favourite slots.
type FavGame = Pick<GameSearchResult, "id" | "slug" | "title" | "cover_url">;

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600",  "bg-emerald-600", "bg-sky-600",  "bg-pink-600",
];

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export function EditProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();

  // ── Profile field state ──────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername]       = useState(profile.username);
  const [bio, setBio]                 = useState(profile.bio ?? "");
  const [website, setWebsite]         = useState(profile.website ?? "");

  // ── Avatar state ─────────────────────────────────────────────────────────────
  const [avatarFile, setAvatarFile]       = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Favourite games state ─────────────────────────────────────────────────────
  // Always exactly 5 elements; null means an empty slot.
  const [slots, setSlots] = useState<(FavGame | null)[]>([null, null, null, null, null]);

  // ── Search modal state ───────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]             = useState(false);
  const [modalTargetSlot, setModalTargetSlot] = useState(0);
  const [modalQuery, setModalQuery]           = useState("");

  // TanStack Query hook at top level (Rules of Hooks).
  // Only fires when the modal is open and query is ≥ 3 chars.
  const { results: searchResults, isLoading: searchLoading } = useGameSearch(
    modalOpen ? modalQuery : ""
  );

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Username availability ─────────────────────────────────────────────────────
  type UsernameStatus = "idle" | "checking" | "available" | "taken";
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Load existing favourites on mount.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("favourite_games")
      .select("position, games(id, slug, title, cover_url)")
      .eq("user_id", profile.id)
      .order("position")
      .then(({ data }) => {
        if (!data) return;
        const next: (FavGame | null)[] = [null, null, null, null, null];
        for (const row of data as unknown as { position: number; games: FavGame | null }[]) {
          if (row.games && row.position >= 1 && row.position <= 5) {
            next[row.position - 1] = row.games;
          }
        }
        setSlots(next);
      });
  }, [profile.id]);

  // Debounced username uniqueness check.
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed === profile.username || !USERNAME_RE.test(trimmed)) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const id = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", trimmed)
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 500);
    return () => clearTimeout(id);
  }, [username, profile.username]);

  // Auto-dismiss toast after 3 s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Revoke preview object URL to avoid memory leaks.
  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  // Close modal on Escape.
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setErrors((prev) => ({ ...prev, avatar: "Image must be under 2 MB" }));
      e.target.value = "";
      return;
    }
    setErrors(({ avatar: _removed, ...rest }) => rest);
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  // DnD: splice-based reorder so games can be moved to any of the 4 positions.
  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const from = result.source.index;
    const to   = result.destination.index;
    if (from === to) return;
    const next = Array.from(slots);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSlots(next);
  }

  function removeGame(slotIndex: number) {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }

  function openModal(slotIndex: number) {
    setModalTargetSlot(slotIndex);
    setModalQuery("");
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); }

  function addGame(game: GameSearchResult) {
    // If this game already occupies another slot, clear it first.
    const next = slots.map((s) => (s?.id === game.id ? null : s)) as (FavGame | null)[];
    next[modalTargetSlot] = { id: game.id, slug: game.slug, title: game.title, cover_url: game.cover_url };
    setSlots(next);
    closeModal();
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (displayName.length > 50) next.displayName = "Max 50 characters";
    const trimmedUsername = username.trim();
    if (!USERNAME_RE.test(trimmedUsername)) {
      next.username = "3–30 characters: lowercase letters, numbers, and underscores only";
    } else if (usernameStatus === "taken") {
      next.username = "Username is already taken";
    }
    if (bio.length > 300) next.bio = "Max 300 characters";
    const trimmedWebsite = website.trim();
    if (trimmedWebsite && !/^https?:\/\/.+/.test(trimmedWebsite)) {
      next.website = "Must start with http:// or https://";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    if (usernameStatus === "checking") return;

    setSaving(true);
    const supabase = createClient();

    // ── 1. Upload avatar ───────────────────────────────────────────────────────
    let newAvatarUrl: string | undefined;
    if (avatarFile) {
      const ext  = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (uploadErr) {
        setErrors({ avatar: `Upload failed: ${uploadErr.message}` });
        setSaving(false);
        return;
      }
      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    // ── 2. Update profile row ──────────────────────────────────────────────────
    const trimmedUsername = username.trim();
    const payload: Partial<Profile> = {
      display_name: displayName.trim() || null,
      username:     trimmedUsername,
      bio:          bio.trim() || null,
      website:      website.trim() || null,
    };
    if (newAvatarUrl !== undefined) payload.avatar_url = newAvatarUrl;

    const { error: updateErr } = await (supabase as any)
      .from("profiles")
      .update(payload)
      .eq("id", profile.id);
    if (updateErr) {
      setErrors({ _form: updateErr.message });
      setSaving(false);
      return;
    }

    // ── 3. Sync favourite games (delete-all + reinsert) ────────────────────────
    // First, upsert any games that don't already exist in the games table.
    // Use the upsert_games() RPC function which runs with elevated privileges.
    const gamesToUpsert = slots
      .filter((game): game is FavGame => game !== null)
      .map((game) => ({
        id: game.id,
        slug: game.slug,
        title: game.title,
        cover_url: game.cover_url,
      }));

    if (gamesToUpsert.length > 0) {
      const { data, error: upsertErr } = await (supabase as any).rpc("upsert_games", {
        game_data: gamesToUpsert,
      });
      if (upsertErr || !data?.[0]?.success) {
        const errMsg = upsertErr?.message || data?.[0]?.error || "Unknown error";
        setErrors({ _form: `Failed to sync games: ${errMsg}` });
        setSaving(false);
        return;
      }
    }

    // Now delete old favourite_games entries and insert new ones.
    const { error: delErr } = await (supabase as any)
      .from("favourite_games")
      .delete()
      .eq("user_id", profile.id);
    if (delErr) {
      setErrors({ _form: delErr.message });
      setSaving(false);
      return;
    }

    const favInserts = slots
      .map((game, i) =>
        game ? { user_id: profile.id, game_id: game.id, position: i + 1 } : null
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (favInserts.length > 0) {
      const { error: insErr } = await (supabase as any).from("favourite_games").insert(favInserts);
      if (insErr) {
        setErrors({ _form: insErr.message });
        setSaving(false);
        return;
      }
    }

    setSaving(false);

    // ── 4. Navigate ────────────────────────────────────────────────────────────
    if (trimmedUsername !== profile.username) {
      router.push(`/user/${trimmedUsername}`);
    } else {
      setToast("Profile updated");
      router.refresh();
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const displayAvatarUrl = avatarPreview ?? profile.avatar_url;
  const avatarInitial    = (profile.display_name ?? profile.username).slice(0, 1).toUpperCase();
  const usernameChanged  = username.trim() !== profile.username;
  const saveable         = usernameStatus !== "taken" && usernameStatus !== "checking";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl"
          role="status"
        >
          {toast}
        </div>
      )}

      {/* ── Game search modal ────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/70 px-4 pt-16"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">

            {/* Search input */}
            <div className="border-b border-zinc-800 p-4">
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  autoFocus
                  type="search"
                  placeholder="Search for a game…"
                  value={modalQuery}
                  onChange={(e) => setModalQuery(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Results */}
            <div className="max-h-72 overflow-y-auto">
              {modalQuery.trim().length < 3 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  Type at least 3 characters to search
                </p>
              )}
              {modalQuery.trim().length >= 3 && searchLoading && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">Searching…</p>
              )}
              {modalQuery.trim().length >= 3 && !searchLoading && searchResults.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  No results for &ldquo;{modalQuery}&rdquo;
                </p>
              )}
              {searchResults.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => addGame(game)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800"
                >
                  <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-zinc-700">
                    {game.cover_url ? (
                      <Image
                        src={igdbCover(game.cover_url, "t_cover_big")!}
                        alt={game.title}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-zinc-700" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{game.title}</p>
                    {game.release_date && (
                      <p className="text-xs text-zinc-500">{game.release_date.slice(0, 4)}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-4 py-3 text-right">
              <button
                type="button"
                onClick={closeModal}
                className="text-sm text-zinc-400 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Back link + heading ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href={`/user/${profile.username}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to profile
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-white">Edit Profile</h1>
      </div>

      {/* ── Form ────────────────────────────────────────────────────────────── */}
      <div className="space-y-8">

        {/* ── Avatar ───────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-6">
          <div className="group relative h-24 w-24 shrink-0">
            <div className="h-full w-full overflow-hidden rounded-full">
              {displayAvatarUrl ? (
                <Image src={displayAvatarUrl} alt="Your avatar" fill sizes="96px" className="object-cover" />
              ) : (
                <div className={`flex h-full w-full items-center justify-center text-3xl font-bold text-white ${avatarBg(profile.username)}`}>
                  {avatarInitial}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors hover:bg-black/50 focus-visible:bg-black/50 focus-visible:outline-none"
              aria-label="Change profile photo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Change Photo
            </button>
            <p className="mt-1.5 text-xs text-zinc-500">JPG, PNG or WebP · Max 2 MB</p>
            {errors.avatar && <p className="mt-1 text-xs text-red-400">{errors.avatar}</p>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            className="sr-only"
            aria-hidden="true"
          />
        </div>

        {/* ── Display Name ──────────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="display_name" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Display Name
          </label>
          <input
            id="display_name" type="text" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} maxLength={50}
            placeholder="Your display name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.displayName && <p className="mt-1 text-xs text-red-400">{errors.displayName}</p>}
        </div>

        {/* ── Username ──────────────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Username
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">@</span>
            <input
              id="username" type="text" value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={30} placeholder="your_username" autoComplete="username"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-7 pr-10 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {usernameStatus === "checking" && (
                <svg className="h-4 w-4 animate-spin text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {usernameStatus === "available" && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {usernameStatus === "taken" && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              )}
            </div>
          </div>
          {usernameStatus === "available" && <p className="mt-1 text-xs text-emerald-400">Username is available</p>}
          {usernameStatus === "taken"     && <p className="mt-1 text-xs text-red-400">Username is already taken</p>}
          {errors.username && <p className="mt-1 text-xs text-red-400">{errors.username}</p>}
          {usernameChanged && usernameStatus !== "taken" && !errors.username && (
            <p className="mt-1 text-xs text-amber-400">Changing your username will change your profile URL</p>
          )}
        </div>

        {/* ── Bio ──────────────────────────────────────────────────────────────── */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="bio" className="text-sm font-medium text-zinc-300">Bio</label>
            <span className={`text-xs ${bio.length > 280 ? "text-amber-400" : "text-zinc-500"}`}>
              {bio.length}/300
            </span>
          </div>
          <textarea
            id="bio" value={bio} onChange={(e) => setBio(e.target.value)}
            maxLength={300} rows={4} placeholder="A short bio about yourself…"
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.bio && <p className="mt-1 text-xs text-red-400">{errors.bio}</p>}
        </div>

        {/* ── Website ───────────────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="website" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Website
          </label>
          <input
            id="website" type="url" value={website}
            onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.website && <p className="mt-1 text-xs text-red-400">{errors.website}</p>}
        </div>

        {/* ── Favourite Games ───────────────────────────────────────────────────── */}
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-300">Favourite Games</p>
          <p className="mb-4 text-xs text-zinc-500">
            Pin up to 5 games to your profile. Drag filled slots to reorder.
          </p>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="favourites" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid grid-cols-5 gap-3"
                >
                  {slots.map((game, i) => (
                    <Draggable
                      key={game ? `game-${game.id}` : `empty-${i}`}
                      draggableId={game ? `game-${game.id}` : `empty-${i}`}
                      index={i}
                      isDragDisabled={!game}
                    >
                      {(provided, snapshot) =>
                        game ? (
                          // Filled slot — shows cover, title on hover, X to remove
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`group relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800 ${
                              snapshot.isDragging ? "ring-2 ring-indigo-500 shadow-xl shadow-black/50" : ""
                            }`}
                          >
                            {game.cover_url ? (
                              <Image
                                src={igdbCover(game.cover_url, "t_720p")!}
                                alt={game.title}
                                fill
                                sizes="(max-width: 640px) 25vw, 130px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600" aria-hidden="true">
                                  <rect x="2" y="6" width="20" height="12" rx="2" />
                                  <path d="M6 12h4M8 10v4" /><circle cx="15" cy="12" r="1" /><circle cx="18" cy="12" r="1" />
                                </svg>
                              </div>
                            )}
                            {/* Title on hover */}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <p className="line-clamp-2 text-[10px] font-medium leading-snug text-white">
                                {game.title}
                              </p>
                            </div>
                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={() => removeGame(i)}
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                              aria-label={`Remove ${game.title}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          // Empty slot — click to open search modal
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <button
                              type="button"
                              onClick={() => openModal(i)}
                              className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-700 transition-colors hover:border-indigo-500 hover:bg-indigo-500/5"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500" aria-hidden="true">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                              <span className="text-[10px] text-zinc-500">Add game</span>
                            </button>
                          </div>
                        )
                      }
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {/* ── Global error ───────────────────────────────────────────────────────── */}
        {errors._form && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {errors._form}
          </p>
        )}

        {/* ── Save ──────────────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !saveable}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>

      </div>
    </main>
  );
}
