"use client";

// ChangelogModal — shows once per release to logged-in users.
//
// Version tracking via localStorage key "waypoint_changelog_seen".
// The stored value is the version string from CURRENT_CHANGELOG_VERSION.
// If the stored value doesn't match, the modal is shown after a 500ms delay.
// Dismissed only via the explicit CTA button — no accidental close.

import { useEffect, useState } from "react";
import { CHANGELOGS, CURRENT_CHANGELOG_VERSION, type ChangelogEntry } from "@/lib/changelog";

const STORAGE_KEY = "waypoint_changelog_seen";

export function ChangelogModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen !== CURRENT_CHANGELOG_VERSION) {
      const t = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, CURRENT_CHANGELOG_VERSION);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="changelog-title"
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-5"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(13,13,26,0) 100%)" }}
        >
          <p id="changelog-title" className="text-lg font-bold text-white">
            What&apos;s New on Waypoint
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{CURRENT_CHANGELOG_VERSION}</p>
        </div>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div className="max-h-[55vh] overflow-y-auto px-6 py-4 space-y-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-purple-600/50 hover:[&::-webkit-scrollbar-thumb]:bg-purple-600/80">
          {CHANGELOGS.map((entry, entryIndex) => (
            <ChangelogEntryBlock
              key={entry.version}
              entry={entry}
              isLatest={entryIndex === 0}
            />
          ))}
        </div>

        {/* ── Footer CTA ───────────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800 px-6 py-4">
          <button
            onClick={dismiss}
            className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Got it, let&apos;s go!
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Entry block ──────────────────────────────────────────────────────────────

function ChangelogEntryBlock({
  entry,
  isLatest,
}: {
  entry: ChangelogEntry;
  isLatest: boolean;
}) {
  return (
    <div>
      {/* Version heading */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className={`text-sm font-bold ${isLatest ? "text-violet-400" : "text-zinc-400"}`}>
          {entry.title}
        </h2>
        {isLatest && (
          <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-400">
            New
          </span>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {entry.sections.map((section) => (
          <div key={section.heading}>
            <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${isLatest ? "text-zinc-400" : "text-zinc-600"}`}>
              {section.heading}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item, i) => (
                <li
                  key={i}
                  className={`flex gap-2 text-sm ${isLatest ? "text-zinc-300" : "text-zinc-500"}`}
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-500/60" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
