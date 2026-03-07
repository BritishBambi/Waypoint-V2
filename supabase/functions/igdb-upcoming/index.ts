// supabase/functions/igdb-upcoming/index.ts
// Returns upcoming games releasing in the next 6 months, sorted by hype.
// Secrets required: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  cover?: { url: string };
  first_release_date?: number;
  hypes?: number;
}

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

  return {
    id: game.id,
    slug: game.slug,
    title: game.name,
    cover_url: coverUrl,
    release_date_unix: game.first_release_date ?? null,
    hypes: game.hypes ?? null,
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

  const now = Math.floor(Date.now() / 1000);
  const sixMonthsFromNow = now + 6 * 30 * 24 * 60 * 60;

  const apicalypseBody =
    `fields name, slug, cover.url, first_release_date, hypes; ` +
    `where first_release_date > ${now} ` +
    `& first_release_date < ${sixMonthsFromNow} ` +
    `& version_parent = null ` +
    `& cover != null ` +
    `& (hypes > 5 | rating_count > 10); ` +
    `sort hypes desc; ` +
    `limit 20;`;

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

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...CORS_HEADERS,
    },
  });
});
