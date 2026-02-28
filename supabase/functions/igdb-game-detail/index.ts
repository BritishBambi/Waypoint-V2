// supabase/functions/igdb-game-detail/index.ts
// Fetches a single game from IGDB by slug and upserts it into the Supabase
// games table so that game_logs can safely reference it via foreign key.
//
// Secrets required : IGDB_CLIENT_ID, IGDB_CLIENT_SECRET
// Auto-provided    : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms since epoch
}

interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  cover?: { url: string };
  summary?: string;
  genres?: Array<{ name: string }>;
  platforms?: Array<{ name: string }>;
  first_release_date?: number; // Unix seconds
  rating?: number;             // 0–100 float
  rating_count?: number;
  category?: number;           // 0 = main game
}

// ─── Token cache ──────────────────────────────────────────────────────────────

let tokenCache: TokenCache | null = null;

async function getAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );

  if (!res.ok) {
    throw new Error(`Twitch token request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

// ─── Transform ────────────────────────────────────────────────────────────────

function transformGame(game: IgdbGame) {
  const coverUrl = game.cover?.url
    ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}`
    : null;

  const igdbRating =
    game.rating != null
      ? Math.min(parseFloat(game.rating.toFixed(2)), 99.99)
      : null;

  return {
    id: game.id,
    slug: game.slug,
    title: game.name,
    cover_url: coverUrl,
    summary: game.summary ?? null,
    genres: game.genres?.map((g) => g.name) ?? [],
    platforms: game.platforms?.map((p) => p.name) ?? [],
    release_date: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().split("T")[0]
      : null,
    igdb_rating: igdbRating,
    // rating_count is not in the games schema but useful for the detail page UI.
    // We return it alongside the schema-shaped object rather than storing it.
    rating_count: game.rating_count ?? null,
  };
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Parse body.
  let slug: string;
  try {
    const body = await req.json();
    slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!slug) {
    return json({ error: "'slug' must be a non-empty string" }, 400);
  }

  // Read IGDB secrets.
  const clientId = Deno.env.get("IGDB_CLIENT_ID");
  const clientSecret = Deno.env.get("IGDB_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return json({ error: "IGDB credentials are not configured" }, 500);
  }

  // Obtain (or reuse) the Twitch access token.
  let accessToken: string;
  try {
    accessToken = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    console.error("Token error:", err);
    return json({ error: "Failed to obtain IGDB access token" }, 502);
  }

  // Use a where clause — reliable for exact-field lookups (unlike 'search').
  const safeSlug = slug.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const apicalypseBody =
    `where slug = "${safeSlug}"; ` +
    `fields id,name,slug,cover.url,summary,genres.name,platforms.name,` +
    `first_release_date,rating,rating_count,category; ` +
    `limit 1;`;

  let igdbRes: Response;
  try {
    igdbRes = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
      body: apicalypseBody,
    });
  } catch (err) {
    console.error("IGDB fetch error:", err);
    return json({ error: "Failed to reach IGDB API" }, 502);
  }

  if (!igdbRes.ok) {
    const text = await igdbRes.text().catch(() => "");
    console.error(`IGDB API error ${igdbRes.status}: ${text}`);
    return json({ error: `IGDB API returned ${igdbRes.status}` }, 502);
  }

  const games: IgdbGame[] = await igdbRes.json();

  if (games.length === 0) {
    return json({ error: "Game not found" }, 404);
  }

  const game = transformGame(games[0]);

  // Upsert the game into Supabase so that game_logs.game_id FK is satisfiable.
  // The service-role key bypasses RLS (games table has no INSERT policy for users).
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Destructure rating_count out — it's not a column in the games table.
    const { rating_count: _rc, ...gameRow } = game;

    const { error: upsertErr } = await admin
      .from("games")
      .upsert(
        { ...gameRow, igdb_synced_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (upsertErr) {
      // Non-fatal: return the game data even if the sync fails so the page
      // still renders. The user will see an error if they try to log the game.
      console.error("Supabase games upsert error:", upsertErr);
    }
  }

  return json({ game });
});
