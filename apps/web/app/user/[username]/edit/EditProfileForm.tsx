"use client";

// apps/web/app/user/[username]/edit/EditProfileForm.tsx
// Full edit-profile form. Receives the current profile from the Server Component
// and handles all mutations client-side via the browser Supabase client.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@waypoint/types";

type Profile = Tables<"profiles">;

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

  // ── Field state ─────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername]       = useState(profile.username);
  const [bio, setBio]                 = useState(profile.bio ?? "");
  const [website, setWebsite]         = useState(profile.website ?? "");

  // ── Avatar state ─────────────────────────────────────────────────────────────
  const [avatarFile, setAvatarFile]       = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<string | null>(null);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  // ── Username availability ─────────────────────────────────────────────────────
  type UsernameStatus = "idle" | "checking" | "available" | "taken";
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  // Debounced uniqueness check — skips when username is unchanged or format-invalid.
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

  // Revoke object URL when it changes (or on unmount) to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      setErrors((prev) => ({ ...prev, avatar: "Image must be under 2 MB" }));
      e.target.value = ""; // reset so the same file can be re-selected after fixing
      return;
    }

    // Clear any previous avatar error and update preview.
    setErrors(({ avatar: _removed, ...rest }) => rest);
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (displayName.length > 50) {
      next.displayName = "Max 50 characters";
    }

    const trimmedUsername = username.trim();
    if (!USERNAME_RE.test(trimmedUsername)) {
      next.username = "3–30 characters: lowercase letters, numbers, and underscores only";
    } else if (usernameStatus === "taken") {
      next.username = "Username is already taken";
    }

    if (bio.length > 300) {
      next.bio = "Max 300 characters";
    }

    const trimmedWebsite = website.trim();
    if (trimmedWebsite && !/^https?:\/\/.+/.test(trimmedWebsite)) {
      next.website = "Must start with http:// or https://";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    // Don't save while a username check is still in flight.
    if (usernameStatus === "checking") return;

    setSaving(true);
    const supabase = createClient();

    // ── 1. Upload avatar if a new file was selected ────────────────────────────
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

      newAvatarUrl = supabase.storage
        .from("avatars")
        .getPublicUrl(path).data.publicUrl;
    }

    // ── 2. Update the profile row ──────────────────────────────────────────────
    const trimmedUsername = username.trim();

    const payload: Partial<Profile> = {
      display_name: displayName.trim() || null,
      username:     trimmedUsername,
      bio:          bio.trim() || null,
      website:      website.trim() || null,
    };

    if (newAvatarUrl !== undefined) {
      payload.avatar_url = newAvatarUrl;
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", profile.id);

    if (updateErr) {
      setErrors({ _form: updateErr.message });
      setSaving(false);
      return;
    }

    setSaving(false);

    // ── 3. Post-save navigation ────────────────────────────────────────────────
    if (trimmedUsername !== profile.username) {
      // Username changed — the profile URL has moved; go to the new profile page.
      router.push(`/user/${trimmedUsername}`);
    } else {
      setToast("Profile updated");
      // Re-render Server Components that may display profile data (e.g. nav).
      router.refresh();
    }
  }

  // ── Derived display values ──────────────────────────────────────────────────

  const displayAvatarUrl   = avatarPreview ?? profile.avatar_url;
  const avatarInitial      = (profile.display_name ?? profile.username).slice(0, 1).toUpperCase();
  const usernameChanged    = username.trim() !== profile.username;
  const saveable           = usernameStatus !== "taken" && usernameStatus !== "checking";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl"
          role="status"
        >
          {toast}
        </div>
      )}

      {/* ── Back link + heading ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href={`/user/${profile.username}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
        >
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
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to profile
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-white">Edit Profile</h1>
      </div>

      {/* ── Form fields ─────────────────────────────────────────────────────── */}
      <div className="space-y-8">

        {/* ── Avatar ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-6">

          {/* Avatar display with hover-overlay change button */}
          <div className="group relative h-24 w-24 shrink-0">
            <div className="h-full w-full overflow-hidden rounded-full">
              {displayAvatarUrl ? (
                <Image
                  src={displayAvatarUrl}
                  alt="Your avatar"
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <div
                  className={`flex h-full w-full items-center justify-center text-3xl font-bold text-white ${avatarBg(profile.username)}`}
                >
                  {avatarInitial}
                </div>
              )}
            </div>
            {/* Dark overlay that appears on hover */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors hover:bg-black/50 focus-visible:bg-black/50 focus-visible:outline-none"
              aria-label="Change profile photo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>

          {/* Aside: text button + instructions */}
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Change Photo
            </button>
            <p className="mt-1.5 text-xs text-zinc-500">JPG, PNG or WebP · Max 2 MB</p>
            {errors.avatar && (
              <p className="mt-1 text-xs text-red-400">{errors.avatar}</p>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            className="sr-only"
            aria-hidden="true"
          />
        </div>

        {/* ── Display Name ────────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="display_name" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Display Name
          </label>
          <input
            id="display_name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="Your display name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.displayName && (
            <p className="mt-1 text-xs text-red-400">{errors.displayName}</p>
          )}
        </div>

        {/* ── Username ────────────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Username
          </label>

          {/* Input with @ prefix and availability indicator */}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
              @
            </span>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={30}
              placeholder="your_username"
              autoComplete="username"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-7 pr-10 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Availability indicator — right side of input */}
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {usernameStatus === "checking" && (
                <svg
                  className="h-4 w-4 animate-spin text-zinc-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-label="Checking availability"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {usernameStatus === "available" && (
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
                  className="text-emerald-400"
                  aria-label="Username available"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {usernameStatus === "taken" && (
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
                  className="text-red-400"
                  aria-label="Username taken"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              )}
            </div>
          </div>

          {/* Status messages below the input */}
          {usernameStatus === "available" && (
            <p className="mt-1 text-xs text-emerald-400">Username is available</p>
          )}
          {usernameStatus === "taken" && (
            <p className="mt-1 text-xs text-red-400">Username is already taken</p>
          )}
          {errors.username && (
            <p className="mt-1 text-xs text-red-400">{errors.username}</p>
          )}
          {usernameChanged && usernameStatus !== "taken" && !errors.username && (
            <p className="mt-1 text-xs text-amber-400">
              Changing your username will change your profile URL
            </p>
          )}
        </div>

        {/* ── Bio ─────────────────────────────────────────────────────────────── */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="bio" className="text-sm font-medium text-zinc-300">
              Bio
            </label>
            <span className={`text-xs ${bio.length > 280 ? "text-amber-400" : "text-zinc-500"}`}>
              {bio.length}/300
            </span>
          </div>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={4}
            placeholder="A short bio about yourself…"
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.bio && (
            <p className="mt-1 text-xs text-red-400">{errors.bio}</p>
          )}
        </div>

        {/* ── Website ─────────────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="website" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Website
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.website && (
            <p className="mt-1 text-xs text-red-400">{errors.website}</p>
          )}
        </div>

        {/* ── Global form error ────────────────────────────────────────────────── */}
        {errors._form && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {errors._form}
          </p>
        )}

        {/* ── Save button ─────────────────────────────────────────────────────── */}
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
