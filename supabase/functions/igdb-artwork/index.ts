// supabase/functions/igdb-artwork/index.ts
// Returns a high-resolution landscape image URL for a game from IGDB.
// Used by the homepage hero to show a cinematic backdrop for the most-logged game.
//
// POST  { game_id: number }
// 200   { artwork_url: string | null }
//
// Secrets required: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms since epoch
}

interface IgdbImageRef {
  id: number;
  url: string; // e.g. "//images.igdb.com/igdb/image/upload/t_thumb/HASH.jpg"
}

interface IgdbGameArtwork {
  id: number;
  artworks?: IgdbImageRef[];
  screenshots?: IgdbImageRef[];
}

// ─── Token cache ──────────────────────────────────────────────────────────────

// Module-level — persists for the lifetime of the function instance.
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
    throw new Error(
      `Twitch token request failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Swap any IGDB size token (t_thumb, t_cover_big, etc.) for t_1080p and
// add the https: protocol that IGDB omits from its URLs.
function toHd(url: string): string {
  return `https:${url.replace(/\/t_[a-z0-9_]+\//, "/t_1080p/")}`;
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
  let gameId: number;
  try {
    const body = await req.json();
    const raw = body?.game_id;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      return json({ error: "'game_id' must be a positive number" }, 400);
    }
    gameId = raw;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
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

  // Fetch artworks and screenshots for this game by its IGDB numeric id.
  // Artworks are curated landscape images; screenshots are in-game captures.
  // We prefer artworks since they're more cinematic.
  const apicalypseBody =
    `fields artworks.url, screenshots.url; ` +
    `where id = ${gameId}; ` +
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

  const games: IgdbGameArtwork[] = await igdbRes.json();

  if (games.length === 0) {
    return json({ artwork_url: null });
  }

  const game = games[0];

  // Prefer artworks (curated, landscape) over screenshots (in-game captures).
  const rawUrl =
    game.artworks?.[0]?.url ?? game.screenshots?.[0]?.url ?? null;

  const artwork_url = rawUrl ? toHd(rawUrl) : null;

  return json({ artwork_url });
});
