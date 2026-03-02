import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@waypoint/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogRow = Pick<Tables<"game_logs">, "id" | "status">;

// ─── Query key ────────────────────────────────────────────────────────────────
// Export the key factory so callers can use it for invalidateQueries / setQueryData
// without having to hard-code the string tuple themselves.

export const gameLogKey = (gameId: number, userId: string) =>
  ["game-log", gameId, userId] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Accepts the caller's Supabase client rather than the package singleton, because
// the web app uses @supabase/ssr cookie-based sessions — a separate auth store
// from the localStorage sessions the package client would use.
//
// Pass `initialData` from SSR to avoid a loading flash: the hook returns that
// value immediately and refetches in the background.

export function useGameLog(
  client: SupabaseClient<any, any, any>,
  gameId: number,
  userId: string | null,
  initialData?: LogRow | null,
) {
  return useQuery<LogRow | null>({
    queryKey: gameLogKey(gameId, userId ?? ""),
    queryFn: async () => {
      const { data, error } = await client
        .from("game_logs")
        .select("id, status")
        .eq("game_id", gameId)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 30_000,
    // Seed the cache from SSR data so the button is never empty on first render.
    initialData: initialData ?? undefined,
  });
}
