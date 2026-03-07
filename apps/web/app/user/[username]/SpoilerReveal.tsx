"use client";

import { useState } from "react";

export function SpoilerReveal({ body }: { body: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative mt-1.5">
      <p
        className={`text-sm leading-relaxed text-zinc-400 line-clamp-3 transition-[filter] ${
          revealed ? "" : "blur-sm select-none"
        }`}
      >
        {body}
      </p>
      {!revealed ? (
        <button
          onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
          className="absolute inset-0 flex items-center justify-center text-xs font-medium text-zinc-400 transition-colors hover:text-white"
        >
          ⚠️ Spoiler — click to reveal
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setRevealed(false); }}
          className="mt-1 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
        >
          hide spoiler
        </button>
      )}
    </div>
  );
}
