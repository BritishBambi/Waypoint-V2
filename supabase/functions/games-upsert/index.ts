// supabase/functions/games-upsert/index.ts
// Upserts games into the games table using service role privileges.
// This is needed because regular authenticated users cannot write to the games table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface GameToUpsert {
  id: bigint;
  slug: string;
  title: string;
  cover_url: string | null;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Parse request body.
  let games: GameToUpsert[];
  try {
    const body = await req.json();
    games = Array.isArray(body?.games) ? body.games : [];
  } catch (e) {
    console.error("JSON parse error:", e);
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(games) || games.length === 0) {
    console.warn("No games provided to upsert");
    return json({ error: "No games to upsert" }, 400);
  }

  // Create Supabase client with service role key (has admin privileges).
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log("Environment check:", {
    hasUrl: !!supabaseUrl,
    hasKey: !!serviceRoleKey,
  });

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing credentials:", { supabaseUrl, serviceRoleKey });
    return json({ error: "Service role credentials not configured" }, 500);
  }

  // Upsert games.
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log("Upserting", games.length, "games");

    const { error } = await supabase
      .from("games")
      .upsert(games, { onConflict: "id" });

    if (error) {
      console.error("Upsert error:", error);
      return json({ error: `Failed to upsert games: ${error.message}` }, 400);
    }

    console.log("Successfully upserted games");
    return json({ success: true });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
