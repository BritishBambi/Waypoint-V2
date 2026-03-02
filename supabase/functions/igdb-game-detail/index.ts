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
  dlcs?: number[];             // IDs of DLC entries linked to this game
  expansions?: number[];       // IDs of expansion entries linked to this game
  standalone_expansions?: number[]; // IDs of standalone expansions
  remakes?: number[];
  remasters?: number[];
  artworks?: Array<{ url: string; width: number; height: number }>;
  screenshots?: Array<{ url: string; width: number; height: number }>;
  involved_companies?: Array<{
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }>;
}

interface IgdbDlc {
  id: number;
  name: string;
  slug: string;
  cover?: { url: string };
  first_release_date?: number;
  category?: number; // 1 = dlc, 2 = expansion, 4 = standalone_expansion
  summary?: string;
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
    ? `https:${game.cover.url}`
        .replace("t_thumb",          "t_720p")
        .replace("t_micro",          "t_720p")
        .replace("t_cover_small",    "t_720p")
        .replace("t_cover_big",      "t_720p")
        .replace("t_cover_big_2x",   "t_720p")
    : null;

  const igdbRating =
    game.rating != null
      ? Math.min(parseFloat(game.rating.toFixed(2)), 99.99)
      : null;

  // Screenshots are proven 16:9 gameplay shots — prefer them over artwork.
  // Artwork dimensions are unreliable indicators of scene content (title cards
  // can pass ratio/height checks). Screenshots first, artwork only as fallback.
  // Artwork filter: 1.7–2.5 ratio rejects ultra-wide panoramic strips (6.5:1)
  // and near-square title cards; height >= 700 rejects short banner strips.
  const screenshot = game.screenshots?.find(
    (s) => (s.width ?? 0) >= 1280 && (s.height ?? 0) >= 700
  ) ?? null;
  const landscapeArt = game.artworks?.find(
    (a) => a.width / a.height >= 1.7 && a.width / a.height <= 2.5 && a.height >= 700
  ) ?? null;
  const backdrop = screenshot ?? landscapeArt ?? null;
  const banner_url = backdrop
    ? `https:${backdrop.url}`.replace(/\/t_[^/]+\//, "/t_1080p/")
    : null;

  const developer =
    game.involved_companies?.find((c) => c.developer)?.company?.name ?? null;
  const publisher =
    game.involved_companies?.find((c) => c.publisher)?.company?.name ?? null;

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
    // These fields are not in the games schema — returned for the UI only, not stored.
    rating_count: game.rating_count ?? null,
    banner_url,
    developer,
    publisher,
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
  // Include the dlcs/expansions/standalone_expansions arrays so we can fetch
  // DLC details by ID rather than relying on the parent_game back-reference.
  const safeSlug = slug.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const apicalypseBody =
    `where slug = "${safeSlug}"; ` +
    `fields id,name,slug,cover.url,summary,genres.name,platforms.name,` +
    `first_release_date,rating,rating_count,category,` +
    `dlcs,expansions,standalone_expansions,` +
    `artworks.url,artworks.width,artworks.height,` +
    `screenshots.url,screenshots.width,screenshots.height,` +
    `involved_companies.company.name,involved_companies.developer,involved_companies.publisher; ` +
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

  const rawGame = games[0];
  const game = transformGame(rawGame);

  const _debug = {
    artworks: rawGame.artworks?.map(a => ({
      url: a.url,
      width: a.width,
      height: a.height,
      ratio: a.width && a.height ? parseFloat((a.width / a.height).toFixed(2)) : null,
    })),
    screenshots: rawGame.screenshots?.map(s => ({
      url: s.url,
      width: s.width,
      height: s.height,
    })),
    selected_banner: game.banner_url,
  };

  // Collect all DLC/expansion IDs from the game's own arrays.
  // This is more reliable than querying parent_game back-references.
  const dlcIds = [
    ...(rawGame.dlcs ?? []),
    ...(rawGame.expansions ?? []),
    ...(rawGame.standalone_expansions ?? []),
  ];

  console.log(`[igdb-game-detail] slug=${slug} igdb_id=${rawGame.id} dlcIds=${JSON.stringify(dlcIds)}`);

  const [dlcRes] = await Promise.all([
    // DLC fetch — best-effort, non-fatal. Skip if no IDs.
    dlcIds.length > 0
      ? fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: {
            "Client-ID": clientId,
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "text/plain",
          },
          body:
            `fields name,slug,cover.url,first_release_date,category,summary; ` +
            `where id = (${dlcIds.join(",")}); ` +
            `limit 15;`,
        }).then(async (r) => {
            const raw = await r.text();
            console.log(`[igdb-game-detail] DLC response status=${r.status} body=${raw.slice(0, 500)}`);
            if (!r.ok) return [];
            return JSON.parse(raw) as IgdbDlc[];
          }).catch((err) => { console.error("[igdb-game-detail] DLC fetch error:", err); return []; })
      : Promise.resolve([]),

    // Supabase upsert — sync game into the games table for FK references.
    (async () => {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) return;

      const admin = createClient(supabaseUrl, serviceRoleKey);
      // Destructure UI-only fields out — they're not columns in the games table.
      const { rating_count: _rc, banner_url: _bu, developer: _dev, publisher: _pub, ...gameRow } = game;

      const { error: upsertErr } = await admin
        .from("games")
        .upsert(
          { ...gameRow, igdb_synced_at: new Date().toISOString() },
          { onConflict: "id" }
        );

      if (upsertErr) {
        // Non-fatal: log and continue — the page still renders.
        console.error("Supabase games upsert error:", upsertErr);
      }
    })(),
  ]);

  // Transform DLC items into the client-facing shape.
  const dlc = (dlcRes as IgdbDlc[])
    .sort((a, b) => (a.first_release_date ?? 0) - (b.first_release_date ?? 0))
    .map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.name,
      cover_url: d.cover?.url
        ? `https:${d.cover.url}`
            .replace("t_thumb",        "t_720p")
            .replace("t_micro",        "t_720p")
            .replace("t_cover_small",  "t_720p")
            .replace("t_cover_big",    "t_720p")
            .replace("t_cover_big_2x", "t_720p")
        : null,
      release_date: d.first_release_date
        ? new Date(d.first_release_date * 1000).toISOString().split("T")[0]
        : null,
      category: d.category ?? 1,
      summary: d.summary ?? null,
    }));

  return new Response(JSON.stringify({ game, dlc, _debug }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Game metadata changes rarely — cache aggressively, revalidate in background.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ...CORS_HEADERS,
    },
  });
});
