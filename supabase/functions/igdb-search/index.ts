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
  category?: number;      // 0 = main_game, 4 = standalone_expansion, 8 = remake, 9 = remaster
  version_parent?: number; // set on editions (Ultimate, Day One, etc.) — null on base games
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
    `fields name,slug,cover.url,summary,genres.name,platforms.name,first_release_date,rating,rating_count,category,version_parent; ` +
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

  // Log raw category/version_parent values before filtering to verify IGDB field shapes.
  console.log(
    `[igdb-search] query="${query}" raw results:`,
    JSON.stringify(
      games.map((g) => ({ id: g.id, name: g.name, category: g.category, version_parent: g.version_parent }))
    )
  );

  // Only show main_game (category 0) in search results.
  // IGDB omits category when it equals the default (0), so null/undefined → 0.
  // Remakes, remasters, standalone expansions are excluded here — DLC can be
  // browsed from the parent game's detail page instead.
  const ALLOWED_CATEGORIES = new Set([0]);

  // Adult content keywords — checked as substrings of the lowercased title.
  const ADULT_KEYWORDS = ["sex", "porn", "hentai", "eroge", "adult", "xxx"];

  const results = games
    .filter((g) => ALLOWED_CATEGORIES.has(g.category ?? 0))
    // Editions (Ultimate, Day One, Collector's, etc.) have a version_parent
    // pointing to the base game. Exclude them — only base games in search.
    .filter((g) => g.version_parent == null)
    // Must have a cover — no cover art is a strong signal of a junk/test entry.
    .filter((g) => !!g.cover?.url)
    // Rating threshold: require ≥ 10 ratings, OR null (unrated) only when it's a
    // main_game (category 0 / omitted) with a cover already confirmed above.
    .filter((g) => {
      if (g.rating_count == null) return (g.category ?? 0) === 0;
      return g.rating_count >= 10;
    })
    // Strip adult content by title keyword.
    .filter((g) => {
      const lower = g.name.toLowerCase();
      return !ADULT_KEYWORDS.some((kw) => lower.includes(kw));
    })
    .sort((a, b) => (b.rating_count ?? 0) - (a.rating_count ?? 0))
    .slice(0, 20)
    .map(transformGame);

  return json({ results });
});
