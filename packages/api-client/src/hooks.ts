import { useQuery } from "@tanstack/react-query";
import type { Trip, Waypoint } from "@waypoint/types";
import { supabase } from "./client";

export function useWaypoints(userId: string) {
  return useQuery({
    queryKey: ["waypoints", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waypoints")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Waypoint[];
    },
  });
}

export function useTrips(userId: string) {
  return useQuery({
    queryKey: ["trips", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Trip[];
    },
  });
}
