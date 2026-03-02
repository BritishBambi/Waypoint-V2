// supabase/functions/igdb-search/index.ts
// Proxies game search requests to the IGDB API.
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
  summary?: string;
  genres?: Array<{ name: string }>;
  platforms?: Array<{ name: string }>;
  first_release_date?: number; // Unix seconds
  rating?: number;        // 0–100 float
  rating_count?: number;  // number of ratings — used for popularity sort
  // NOTE: IGDB never returns `category` in search or where-based responses —
  // the field is always absent regardless of the game's actual category value.
  // Use `version_parent` (editions) and `parent_game` (DLC/expansions) instead.
  category?: number;       // never returned; kept for type completeness only
  version_parent?: number; // set on editions (Ultimate, Day One, etc.) — null on base games
  parent_game?: number;    // set on DLC/expansions — null on standalone base games
}

// Module-level cache — persists for the lifetime of the function instance.
let tokenCache: TokenCache | null = null;

async function getAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  // Return cached token if it has more than 60 s left.
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
  // Upgrade to cover_big (264×374) and add https: protocol.
  const coverUrl = game.cover?.url
    ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}`
    : null;

  // IGDB rating is 0–100; schema column is numeric(4,2) so max is 99.99.
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
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // The Supabase JS client automatically sends x-client-info and apikey
  // alongside Authorization and Content-Type. All four must be listed here
  // or the browser's CORS preflight will block the request.
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
  // Handle CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Parse and validate the request body.
  let query: string;
  try {
    const body = await req.json();
    query = typeof body?.query === "string" ? body.query.trim() : "";
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!query) {
    return json({ error: "'query' must be a non-empty string" }, 400);
  }

  // Read secrets from the environment.
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

  // Escape double quotes in the query to prevent Apicalypse injection.
  const safeQuery = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // IGDB's `search` + `where` combination is unreliable in Apicalypse —
  // filtering is applied in TypeScript below instead.
  const apicalypseBody =
    `fields name,slug,cover.url,summary,genres.name,platforms.name,first_release_date,rating,rating_count,category,version_parent,parent_game; ` +
    `search "${safeQuery}"; ` +
    `limit 30;`;

  // Query the IGDB API.
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

  // IGDB never populates the `category` field in API responses (confirmed by testing:
  // it is always absent/undefined for every game regardless of actual category).
  // Instead we rely on two relationship fields that ARE reliably returned:
  //   version_parent — set on editions (Ultimate, Day One, Collector's, etc.)
  //   parent_game    — set on DLC, expansions, updates (Phantom Liberty, Edgerunners Update, etc.)
  // Any game with either field set is NOT a standalone base game and is excluded.

  // Adult content keywords — checked as substrings of the lowercased title.
  const ADULT_KEYWORDS = ["sex", "porn", "hentai", "eroge", "adult", "xxx"];

  // Normalised query used for title-match boosting in the sort below.
  const queryLower = query.toLowerCase();

  const results = games
    // Exclude editions of other games (Ultimate Edition, Day One, etc.).
    .filter((g) => g.version_parent == null)
    // Exclude DLC, expansions, updates — they have a parent_game reference.
    // Exception: allow entries with rating_count >= 200, which indicates a
    // substantial standalone release that IGDB has miscategorised (e.g.
    // Minecraft Bedrock Edition is marked parent_game of Java Edition).
    .filter((g) => g.parent_game == null || (g.rating_count != null && g.rating_count >= 200))
    // Must have a cover — no cover is a strong signal of a junk/test entry.
    .filter((g) => !!g.cover?.url)
    // Rating threshold: require ≥ 10 ratings, OR unrated (null) is allowed.
    .filter((g) => g.rating_count == null || g.rating_count >= 10)
    // Strip adult content by title keyword.
    .filter((g) => {
      const lower = g.name.toLowerCase();
      return !ADULT_KEYWORDS.some((kw) => lower.includes(kw));
    })
    // Three-tier sort:
    //   1. Exact title match (e.g. "Minecraft" when query is "minecraft")
    //   2. Title starts with query (e.g. "Zelda: …" when query is "zelda")
    //   3. Popularity (rating_count descending) as tiebreaker
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aExact = aName === queryLower ? 1 : 0;
      const bExact = bName === queryLower ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      const aStarts = aName.startsWith(queryLower) ? 1 : 0;
      const bStarts = bName.startsWith(queryLower) ? 1 : 0;
      if (bStarts !== aStarts) return bStarts - aStarts;
      return (b.rating_count ?? 0) - (a.rating_count ?? 0);
    })
    .slice(0, 20)
    .map(transformGame);

  return json({ results });
});
