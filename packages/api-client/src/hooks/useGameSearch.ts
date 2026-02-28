import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@waypoint/types";
import { supabase } from "../client";

// ─── Types ────────────────────────────────────────────────────────────────────

// The Edge Function returns the same shape as the games table row, but without
// igdb_synced_at (that field is only written by the background sync job).
export type GameSearchResult = Omit<Tables<"games">, "igdb_synced_at">;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useGameSearch — searches IGDB for games matching a query string.
 *
 * TanStack Query concepts used here:
 *
 * queryKey: ["game-search", query]
 *   A unique cache key for this request. TanStack Query stores every response
 *   in a cache keyed by this array. If the same key is requested again while
 *   the data is still "fresh", the cached result is returned instantly with no
 *   network call. Changing `query` changes the key, triggering a new fetch.
 *
 * queryFn
 *   The async function that actually fetches data. It must return a value on
 *   success or throw on failure. TanStack Query calls this for you — you never
 *   call it directly.
 *
 * enabled: query.trim().length >= 3
 *   A boolean gate. When false, the query is "dormant" — queryFn is never
 *   called, isLoading stays false, and no network request is made. This lets
 *   us wait until the user has typed at least 3 characters before hitting the
 *   API.
 *
 * staleTime: 5 * 60 * 1000
 *   How long (ms) a cached result is considered fresh. During this window,
 *   components that mount and request the same queryKey get the cached data
 *   immediately without re-fetching. After staleTime, the next request
 *   triggers a background refetch. Game metadata is stable, so 5 minutes is
 *   a safe choice.
 *
 * Returned shape: { data, isLoading, isError, error }
 *   TanStack Query manages all state transitions automatically:
 *   - isLoading: true only on the very first fetch (no cached data yet).
 *   - isFetching: true whenever a fetch is in flight (including background
 *     refetches). Not returned here but available if you need it.
 *   - isError / error: populated if queryFn throws.
 *   - data: the resolved value from queryFn, or undefined while loading.
 */
export function useGameSearch(query: string) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["game-search", query],

    queryFn: async (): Promise<GameSearchResult[]> => {
      // functions.invoke calls the named Supabase Edge Function over HTTPS.
      // The generic parameter tells TypeScript what shape `data` will have.
      const { data, error } = await supabase.functions.invoke<{
        results: GameSearchResult[];
      }>("igdb-search", {
        body: { query },
      });

      if (error) throw error;
      return data?.results ?? [];
    },

    // Don't fetch until the query is at least 3 characters.
    enabled: query.trim().length >= 3,

    // Cache results for 5 minutes — IGDB game metadata is stable.
    staleTime: 5 * 60 * 1000,
  });

  return {
    results: data ?? [],
    isLoading,
    isError,
    error,
  };
}
