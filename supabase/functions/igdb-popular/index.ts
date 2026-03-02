// supabase/functions/igdb-popular/index.ts
// Returns the most followed / globally popular base games from IGDB.
// No request body needed — this is a pure popularity sort.
// Secrets required: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET

interface TokenCache {
  token: string;
  expiresAt: number; // ms since epoch
}

interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  cover?: { url: string };
  rating?: number;       // 0–100 float
  rating_count?: number;
  follows?: number;
  first_release_date?: number; // Unix seconds
  version_parent?: number;     // set on editions — null on base games
  parent_game?: number;        // set on DLC/expansions — null on standalone games
}

// Module-level cache — persists for the lifetime of the function instance.
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

function transformGame(game: IgdbGame) {
  // IGDB cover URLs look like //images.igdb.com/igdb/image/upload/t_thumb/co1wyy.jpg
  // Explicitly replace every known IGDB size token with t_720p (~480×720).
  // Using an explicit multi-replace instead of a regex avoids missing tokens
  // that contain digits (t_720p, t_1080p) if the URL is already partly upgraded.
  const coverUrl = game.cover?.url
    ? `https:${game.cover.url}`
        .replace("t_thumb",          "t_720p")
        .replace("t_micro",          "t_720p")
        .replace("t_cover_small",    "t_720p")
        .replace("t_cover_big",      "t_720p")
        .replace("t_cover_big_2x",   "t_720p")
        .replace("t_screenshot_med", "t_720p")
        .replace("t_screenshot_big", "t_720p")
        .replace("t_1080p",          "t_720p")
    : null;

  const igdbRating =
    game.rating != null
      ? Math.min(parseFloat(game.rating.toFixed(2)), 99.99)
      : null;

  const releaseYear = game.first_release_date
    ? new Date(game.first_release_date * 1000).getUTCFullYear()
    : null;

  return {
    id: game.id,
    slug: game.slug,
    title: game.name,
    cover_url: coverUrl,
    igdb_rating: igdbRating,
    release_year: releaseYear,
  };
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Optional pagination params — body is safe to omit (defaults to page 1 of 25).
  let limit = 25;
  let offset = 0;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.limit === "number") limit = Math.min(Math.max(1, body.limit), 50);
    if (typeof body?.offset === "number") offset = Math.min(Math.max(0, body.offset), 500);
  } catch { /* use defaults */ }

  const clientId = Deno.env.get("IGDB_CLIENT_ID");
  const clientSecret = Deno.env.get("IGDB_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return json({ error: "IGDB credentials are not configured" }, 500);
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    console.error("Token error:", err);
    return json({ error: "Failed to obtain IGDB access token" }, 502);
  }

  // Pure popularity sort — no search keyword, so where + sort works reliably here.
  // version_parent = null excludes editions (Ultimate, Day One, etc.)
  // parent_game = null excludes DLC, expansions, and updates
  // rating_count > 500 ensures genuine titles with enough votes
  const apicalypseBody =
    `fields name,slug,cover.url,rating,rating_count,follows,first_release_date,version_parent,parent_game; ` +
    `where rating_count > 500 & version_parent = null & parent_game = null & cover != null; ` +
    `sort follows desc; ` +
    `limit ${limit}; ` +
    `offset ${offset};`;

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
  const results = games.map(transformGame);

  return json({ results });
});
