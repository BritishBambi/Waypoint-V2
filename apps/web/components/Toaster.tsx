"use client";

import { useState, useEffect } from "react";
import { subscribeToasts, dismiss, type ToastEntry } from "@/lib/toast";

export function Toaster() {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts(setEntries);
    return () => { unsubscribe(); };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col-reverse items-end gap-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-xl ring-1 ${
            entry.kind === "error"
              ? "bg-red-900 ring-red-700"
              : "bg-zinc-800 ring-zinc-700"
          }`}
        >
          {entry.kind === "error" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-400" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-400" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          <span>{entry.message}</span>
          <button
            onClick={() => dismiss(entry.id)}
            aria-label="Dismiss"
            className="ml-1 shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
