"use client";

import { useState } from "react";
import { formatRelativeDate } from "@/lib/formatDate";

export type Achievement = {
  achievement_api_name: string;
  name: string;
  description: string | null;
  icon_url: string;
  icon_gray_url: string;
  unlocked: boolean;
  unlock_time: string | null;
  global_percent: number | null;
};

interface Props {
  achievements: Achievement[];
  unlocked: number;
  total: number;
}

export function AchievementSection({ achievements, unlocked, total }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  if (achievements.length === 0) return null;

  return (
    <>
      {/* Trophy + count — click to open modal */}
      <button
        onClick={() => setModalOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-sm text-white/60 cursor-pointer hover:text-white/80 transition-colors"
      >
        🏆 <span>{unlocked} / {total} achievements</span>
      </button>

      {/* Icon preview row */}
      <div className="mt-2">
        <div
          className="flex gap-1.5 flex-wrap max-h-[68px] overflow-y-hidden cursor-pointer"
          onClick={() => setModalOpen(true)}
        >
          {achievements.slice(0, 20).map((ach) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={ach.achievement_api_name}
              src={ach.unlocked ? ach.icon_url : ach.icon_gray_url}
              alt={ach.name}
              title={ach.name}
              width={64}
              height={64}
              className={`w-16 h-16 rounded-sm${!ach.unlocked ? " opacity-40" : ""}`}
            />
          ))}
          {achievements.length > 20 && (
            <div className="w-16 h-16 rounded-sm bg-white/10 flex items-center justify-center text-sm text-white/50">
              +{achievements.length - 20}
            </div>
          )}
        </div>
        <p
          className="text-xs text-white/40 mt-1.5 cursor-pointer hover:text-white/60 transition-colors"
          onClick={() => setModalOpen(true)}
        >
          Click to view all achievements
        </p>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-800 flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
              <div>
                <h2 className="text-base font-semibold text-white">Achievements</h2>
                <p className="text-sm text-white/50 mt-0.5">{unlocked} / {total} unlocked</p>
                <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-violet-500"
                    style={{ width: `${Math.round((unlocked / total) * 100)}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-white/40 hover:text-white/70 transition-colors ml-4 mt-0.5"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Scrollable achievement list */}
            <div className="overflow-y-auto flex-1 px-5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-purple-600/50 [&::-webkit-scrollbar-thumb]:rounded-full">
              {achievements.map((ach) => (
                <div key={ach.achievement_api_name} className="flex items-start gap-3 py-3 border-b border-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ach.unlocked ? ach.icon_url : ach.icon_gray_url}
                    alt={ach.name}
                    width={48}
                    height={48}
                    className={`w-12 h-12 rounded-md flex-shrink-0${!ach.unlocked ? " opacity-30 grayscale" : ""}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium${ach.unlocked ? " text-white" : " text-white/40"}`}>
                      {ach.name}
                    </p>
                    {ach.description && (
                      <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                        {ach.description}
                      </p>
                    )}
                    {ach.unlocked && ach.unlock_time && (
                      <p className="text-xs text-purple-400 mt-1">
                        Unlocked {formatRelativeDate(ach.unlock_time)}
                      </p>
                    )}
                  </div>
                  {ach.global_percent !== null && (
                    <span className="text-xs text-white/30 flex-shrink-0 self-center">
                      {ach.global_percent.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
