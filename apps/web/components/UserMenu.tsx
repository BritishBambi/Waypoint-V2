"use client";

// UserMenu — avatar + username trigger with a dropdown nav menu.
// Rendered by Nav (Server Component) which passes username + avatarUrl.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const AVATAR_COLORS = [
  "bg-violet-600", "bg-blue-600",   "bg-emerald-600",
  "bg-rose-600",   "bg-amber-600",  "bg-cyan-600",
];

function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface UserMenuProps {
  username: string;
  avatarUrl: string | null;
}

export function UserMenu({ username, avatarUrl }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard redirect — clears all React / Supabase client state.
    window.location.href = "/";
  }

  const initial = username.slice(0, 1).toUpperCase();

  return (
    <div ref={containerRef} className="relative">

      {/* ── Trigger ──────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open user menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        {/* Avatar */}
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-700">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={username}
              fill
              sizes="32px"
              className="object-cover"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center text-xs font-bold text-white ${avatarBg(username)}`}
            >
              {initial}
            </div>
          )}
        </div>

        {/* Username — hidden on very small screens */}
        <span className="hidden text-sm text-zinc-300 sm:block">{username}</span>

        {/* Chevron */}
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
          className={`hidden transition-transform duration-150 sm:block ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* ── Dropdown ─────────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl shadow-black/40">

          <MenuItem href="/" onNavigate={() => setOpen(false)}>Home</MenuItem>
          <MenuItem href={`/user/${username}`} onNavigate={() => setOpen(false)}>Profile</MenuItem>

          <div className="my-1 border-t border-zinc-800" />

          <MenuItem href={`/user/${username}/library`} onNavigate={() => setOpen(false)}>Library</MenuItem>
          <MenuItem href={`/user/${username}/wishlist`} onNavigate={() => setOpen(false)}>Wishlist</MenuItem>
          <MenuItem href={`/user/${username}/stats`} onNavigate={() => setOpen(false)}>Stats</MenuItem>

          <div className="my-1 border-t border-zinc-800" />

          <MenuItem href="/search?tab=users" onNavigate={() => setOpen(false)}>Find Friends</MenuItem>

          <div className="my-1 border-t border-zinc-800" />

          <MenuItem href={`/user/${username}/edit`} onNavigate={() => setOpen(false)}>Edit Profile</MenuItem>
          <MenuItem href="/lists/new" onNavigate={() => setOpen(false)}>Create List →</MenuItem>

          <div className="my-1 border-t border-zinc-800" />

          <button
            onClick={handleSignOut}
            className="flex w-full items-center px-4 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            Sign Out
          </button>

        </div>
      )}

    </div>
  );
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
    >
      {children}
    </Link>
  );
}
