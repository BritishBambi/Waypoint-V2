// supabase/functions/steam-sync/index.ts
// Syncs a user's Steam library into user_steam_data:
//   - Owned games + playtime from Steam API
//   - Achievement counts for games in the Waypoint games table
//   - Reverse lookup: unknown Steam AppIDs → IGDB → upserted to games table
//
// Secrets required:
//   STEAM_API_KEY                   — Steam Web API key
//   IGDB_CLIENT_ID                  — Twitch/IGDB client id
//   IGDB_CLIENT_SECRET              — Twitch/IGDB client secret
//   SUPABASE_URL                    — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY       — auto-provided

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Supabase .in() queries fail silently with large arrays. Batch into chunks of
// 200 and merge results to stay well within query size limits.
async function batchIn<T>(
  admin: ReturnType<typeof createClient>,
  table: string,
  selectCols: string,
  column: string,
  values: number[],
  extraFilters?: (query: any) => any
): Promise<T[]> {
  const BATCH = 200;
  const results: T[] = [];
  for (let i = 0; i < values.length; i += BATCH) {
    let q = admin.from(table).select(selectCols).in(column, values.slice(i, i + BATCH));
    if (extraFilters) q = extraFilters(q);
    const { data } = await q;
    if (data) results.push(...(data as T[]));
  }
  return results;
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

// ─── IGDB discovery ───────────────────────────────────────────────────────────

async function discoverGamesFromIGDB(
  appIds: number[],
  igdbToken: string,
  igdbClientId: string,
  admin: ReturnType<typeof createClient>
): Promise<number> {
  const BATCH_SIZE = 500;
  let discovered = 0;

  for (let i = 0; i < appIds.length; i += BATCH_SIZE) {
    const batch = appIds.slice(i, i + BATCH_SIZE);
    const uidList = batch.map((id) => `"${id}"`).join(",");

    const igdbRes = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": igdbClientId,
        "Authorization": `Bearer ${igdbToken}`,
        "Content-Type": "text/plain",
      },
      body: `
        fields
          id,
          name,
          slug,
          summary,
          first_release_date,
          cover.url,
          genres.name,
          platforms.name,
          external_games.uid,
          external_games.category;
        where
          external_games.uid = (${uidList});
        limit 500;
      `,
    });

    if (!igdbRes.ok) {
      console.error("[steam-sync] IGDB batch query failed:", igdbRes.status);
      continue;
    }

    const igdbGames = await igdbRes.json();
    if (!igdbGames?.length) continue;

    // Build a set of the AppIDs we queried so we can match exactly —
    // IGDB returns ALL external_games entries for a game, not just the Steam one,
    // and other platforms (GOG, Xbox, etc.) use the same numeric ID range.
    // Matching by "first numeric entry" picks the wrong platform.
    const batchSet = new Set(batch.map(String));

    const gameRows = igdbGames
      .map((game: any) => {
        // Find the entry whose uid is one of the AppIDs we queried for.
        // This is the only reliable way to identify the Steam entry since
        // IGDB never returns the category field in responses.
        const steamEntry = (game.external_games ?? []).find((eg: any) =>
          batchSet.has(eg.uid)
        );
        if (!steamEntry) return null;

        const steamAppId = parseInt(steamEntry.uid);
        if (isNaN(steamAppId)) return null;

        const coverUrl = game.cover?.url
          ? game.cover.url
              .replace("t_thumb", "t_cover_big")
              .replace("t_720p", "t_cover_big")
              .replace(/^\/\//, "https://")
          : null;

        const releaseDate =
          game.first_release_date
            ? new Date(game.first_release_date * 1000).toISOString().split("T")[0]
            : null;

        return {
          id:           game.id,
          slug:         game.slug,
          title:        game.name,
          summary:      game.summary ?? null,
          cover_url:    coverUrl,
          release_date: releaseDate,
          genres:       (game.genres ?? []).map((g: any) => g.name),
          platforms:    (game.platforms ?? []).map((p: any) => p.name),
          steam_app_id: steamAppId,
        };
      })
      .filter(Boolean);

    if (gameRows.length === 0) continue;

    // Deduplicate by slug — IGDB sometimes returns duplicate entries for the
    // same game, which causes "ON CONFLICT DO UPDATE command cannot affect row
    // a second time" if two rows with the same slug appear in one batch.
    const seen = new Set<string>();
    const dedupedRows = gameRows.filter((row: any) => {
      if (seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    });

    const { error: upsertError } = await admin
      .from("games")
      .upsert(dedupedRows, { onConflict: "id", ignoreDuplicates: false });

    if (upsertError) {
      console.error("[steam-sync] Game upsert error:", upsertError);
    } else {
      discovered += dedupedRows.length;
      console.log(
        `[steam-sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: discovered ${dedupedRows.length} games from IGDB`
      );
    }

    // Respect IGDB rate limit — 4 req/s
    if (i + BATCH_SIZE < appIds.length) {
      await sleep(250);
    }
  }

  return discovered;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── 1. Authenticate the caller ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const userJwt    = authHeader.replace(/^Bearer\s+/i, "").trim();

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const steamApiKey    = Deno.env.get("STEAM_API_KEY");
  const igdbClientId   = Deno.env.get("IGDB_CLIENT_ID");
  const igdbClientSecret = Deno.env.get("IGDB_CLIENT_SECRET");

  console.log("env check:", {
    supabase_url_present:    !!Deno.env.get("SUPABASE_URL"),
    service_role_present:    !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    steam_key_present:       !!Deno.env.get("STEAM_API_KEY"),
    igdb_client_id_present:  !!igdbClientId,
    igdb_secret_present:     !!igdbClientSecret,
  });

  if (!steamApiKey) {
    return json({ error: "STEAM_API_KEY not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: { user }, error: authErr } = await admin.auth.getUser(userJwt);
  if (authErr || !user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = user.id;

  // ── 2. Parse request body ──────────────────────────────────────────────────
  let steamId: string;
  try {
    const body = await req.json();
    steamId = typeof body?.steam_id === "string" ? body.steam_id.trim() : "";
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!steamId || !/^\d+$/.test(steamId)) {
    return json({ error: "'steam_id' must be a numeric string" }, 400);
  }

  // ── 3. Fetch IGDB token (for discovery) ────────────────────────────────────
  let igdbToken: string | null = null;
  if (igdbClientId && igdbClientSecret) {
    try {
      const tokenRes = await fetch(
        `https://id.twitch.tv/oauth2/token` +
        `?client_id=${igdbClientId}` +
        `&client_secret=${igdbClientSecret}` +
        `&grant_type=client_credentials`,
        { method: "POST" }
      );
      const tokenData = await tokenRes.json();
      igdbToken = tokenData.access_token ?? null;
    } catch (e) {
      console.error("[steam-sync] IGDB token fetch failed:", e);
    }
  }

  // ── DEBUG: one-off IGDB query to verify external_games.uid lookup ────────────
  if (igdbToken && igdbClientId) {
    try {
      const debugRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": igdbClientId,
          "Authorization": `Bearer ${igdbToken}`,
          "Content-Type": "text/plain",
        },
        body: `fields name, slug, external_games.uid, external_games.category; where external_games.uid = ("381210","730","578080","1716740"); limit 10;`,
      });
      const debugData = await debugRes.json();
      console.log("[steam-sync] DEBUG IGDB response status:", debugRes.status);
      console.log("[steam-sync] DEBUG IGDB raw response:", JSON.stringify(debugData));
    } catch (e) {
      console.error("[steam-sync] DEBUG IGDB query failed:", e);
    }
  }
  // ── END DEBUG ─────────────────────────────────────────────────────────────────

  // ── 4. Fetch owned games from Steam ─────────────────────────────────────────
  let ownedGames: Array<{ appid: number; playtime_forever: number }>;
  try {
    const ownedRes = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
      `?key=${steamApiKey}&steamid=${steamId}&include_played_free_games=true&format=json`
    );
    const ownedData = await ownedRes.json();
    ownedGames = ownedData?.response?.games ?? [];
  } catch (err) {
    console.error("[steam-sync] GetOwnedGames error:", err);
    return json({ error: "Failed to fetch Steam library" }, 502);
  }

  console.log(`[steam-sync] user=${userId} owned=${ownedGames.length} games`);

  if (ownedGames.length === 0) {
    return json({ games_owned: 0, games_matched: 0, games_discovered: 0, new_titles: [], synced_at: new Date().toISOString() });
  }

  // ── 5. Identify known vs unknown AppIDs ─────────────────────────────────────
  const steamAppIds = ownedGames.map((g) => g.appid).filter(Boolean);

  const existingGames = await batchIn<{ id: number; steam_app_id: number; slug: string }>(
    admin, "games", "id, steam_app_id, slug", "steam_app_id", steamAppIds
  );

  const knownAppIds = new Set(existingGames.map((g) => g.steam_app_id));
  const unknownAppIds = steamAppIds.filter((id) => !knownAppIds.has(id));

  console.log(
    `[steam-sync] Steam library: ${steamAppIds.length} games, ` +
    `${knownAppIds.size} known, ${unknownAppIds.length} unknown`
  );

  // ── 6. Discover unknown games via IGDB ──────────────────────────────────────
  let gamesDiscovered = 0;
  let allKnownGames = existingGames;

  if (unknownAppIds.length > 0 && igdbToken && igdbClientId) {
    console.log(`[steam-sync] Discovering ${unknownAppIds.length} unknown games from IGDB...`);
    gamesDiscovered = await discoverGamesFromIGDB(unknownAppIds, igdbToken, igdbClientId, admin);
    console.log(`[steam-sync] Discovery complete: ${gamesDiscovered} games added to DB`);

    // Re-fetch in batches to include newly discovered games
    allKnownGames = await batchIn<{ id: number; steam_app_id: number; slug: string }>(
      admin, "games", "id, steam_app_id, slug", "steam_app_id", steamAppIds
    );
  }

  // Deduplicate by steam_app_id — two games rows can share the same steam_app_id
  // if IGDB discovery inserted a duplicate. Without this, the sync loop would
  // attempt two upserts for the same steam_app_id, violating the unique constraint
  // on user_steam_data(user_id, steam_app_id).
  const seenAppIds = new Set<number>();
  const matched = allKnownGames.filter((g) => {
    if (seenAppIds.has(g.steam_app_id)) return false;
    seenAppIds.add(g.steam_app_id);
    return true;
  }) as Array<{ id: number; steam_app_id: number; slug: string }>;
  console.log(`[steam-sync] matched=${matched.length} games in Waypoint DB`);

  if (matched.length === 0) {
    return json({
      games_owned:      ownedGames.length,
      games_matched:    0,
      games_discovered: gamesDiscovered,
      new_titles:       [],
      synced_at:        new Date().toISOString(),
    });
  }

  // Build lookup: appid → playtime
  const playtimeByAppId = new Map<number, number>(
    ownedGames.map((g) => [g.appid, g.playtime_forever])
  );

  // Pre-fetch existing user_steam_data for skip optimisation — batched to avoid
  // .in() silent failures with large libraries.
  const existingSteamData = await batchIn<{
    steam_app_id: number;
    playtime_minutes: number;
    achievements_unlocked: number;
    achievements_total: number;
  }>(
    admin,
    "user_steam_data",
    "steam_app_id, playtime_minutes, achievements_unlocked, achievements_total",
    "steam_app_id",
    matched.map((r) => r.steam_app_id),
    (q) => q.eq("user_id", userId)
  );

  const existingDataMap = new Map(existingSteamData.map((d) => [d.steam_app_id, d]));

  // ── 7. Fetch achievement stats for each matched game ─────────────────────────
  const upsertRows: Array<{
    user_id:               string;
    game_id:               number;
    steam_app_id:          number;
    playtime_minutes:      number;
    achievements_unlocked: number;
    achievements_total:    number;
    last_synced_at:        string;
  }> = [];

  const newTitles: Array<{ name: string; slug: string }> = [];
  const now = new Date().toISOString();

  for (const row of matched) {
    const appid    = row.steam_app_id;
    const playtime = playtimeByAppId.get(appid) ?? 0;

    const existingData = existingDataMap.get(appid);
    const playtimeChanged = !existingData || existingData.playtime_minutes !== playtime;
    const alreadyComplete =
      !!existingData &&
      existingData.achievements_unlocked > 0 &&
      existingData.achievements_unlocked === existingData.achievements_total;

    let achievementsUnlocked = existingData?.achievements_unlocked ?? 0;
    let achievementsTotal    = existingData?.achievements_total    ?? 0;

    // Only fetch achievements if:
    //   - user has played the game
    //   - playtime changed since last sync OR achievements not yet complete
    if (playtime > 0 && playtimeChanged && !alreadyComplete) {
      try {
        const [achRes, schemaRes, globalRes] = await Promise.all([
          fetch(
            `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/` +
            `?key=${steamApiKey}&steamid=${steamId}&appid=${appid}&l=english`
          ),
          fetch(
            `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/` +
            `?key=${steamApiKey}&appid=${appid}&l=english`
          ),
          fetch(
            `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/` +
            `?gameid=${appid}`
          ),
        ]);

        if (achRes.ok && schemaRes.ok) {
          const achData    = await achRes.json();
          const schemaData = await schemaRes.json();
          const globalData = globalRes.ok ? await globalRes.json() : null;

          const playerAchs: Array<{ apiname: string; achieved: number; unlocktime: number }> =
            achData?.playerstats?.achievements ?? [];
          const schemaAchs: Array<{
            name: string; displayName: string; description?: string; icon: string; icongray: string;
          }> = schemaData?.game?.availableGameStats?.achievements ?? [];
          const globalPcts: Array<{ name: string; percent: number }> =
            globalData?.achievementpercentages?.achievements ?? [];

          const schemaMap = new Map(schemaAchs.map((a) => [a.name, a]));
          const globalMap = new Map(globalPcts.map((a) => [a.name, a.percent]));

          achievementsTotal    = playerAchs.length;
          achievementsUnlocked = playerAchs.filter((a) => a.achieved === 1).length;

          const achievementRows = playerAchs
            .map((pa) => {
              const schema = schemaMap.get(pa.apiname);
              if (!schema) return null;
              return {
                user_id:              userId,
                steam_app_id:         appid,
                achievement_api_name: pa.apiname,
                name:                 schema.displayName,
                description:          schema.description ?? null,
                icon_url:             schema.icon,
                icon_gray_url:        schema.icongray,
                unlocked:             pa.achieved === 1,
                unlock_time:
                  pa.achieved === 1 && pa.unlocktime > 0
                    ? new Date(pa.unlocktime * 1000).toISOString()
                    : null,
                global_percent: globalMap.get(pa.apiname) ?? null,
              };
            })
            .filter(Boolean);

          if (achievementRows.length > 0) {
            await admin
              .from("user_steam_achievements")
              .upsert(achievementRows, {
                onConflict: "user_id,steam_app_id,achievement_api_name",
              });
          }
        }
      } catch (e) {
        console.error("[steam-sync] Achievement sync failed for appid:", appid, e);
      }

      // Respect Steam API rate limit
      await sleep(100);
    }

    // ── Title award: check for 100% completion ──────────────────────────────
    if (achievementsTotal > 0 && achievementsUnlocked === achievementsTotal) {
      try {
        const { data: matchedTitles } = await admin
          .from("titles")
          .select("id, name, slug")
          .eq("steam_app_id", appid);

        for (const titleRow of (matchedTitles ?? []) as Array<{ id: string; name: string; slug: string }>) {
          const { data: existing } = await admin
            .from("user_titles")
            .select("title_id")
            .eq("user_id", userId)
            .eq("title_id", titleRow.id)
            .maybeSingle();

          if (!existing) {
            await admin.from("user_titles").insert({
              user_id:  userId,
              title_id: titleRow.id,
            });
            await admin.from("notifications").insert({
              user_id:  userId,
              actor_id: userId,
              type:     "title_unlocked",
              title_id: titleRow.id,
            });
            newTitles.push({ name: titleRow.name, slug: titleRow.slug });
          }
        }
      } catch (e) {
        console.error("[steam-sync] Title award failed for appid:", appid, e);
      }
    }

    upsertRows.push({
      user_id:               userId,
      game_id:               row.id,
      steam_app_id:          appid,
      playtime_minutes:      playtime,
      achievements_unlocked: achievementsUnlocked,
      achievements_total:    achievementsTotal,
      last_synced_at:        now,
    });
  }

  // ── 8. Upsert in batches of 200 ─────────────────────────────────────────────
  // Supabase rejects or silently truncates single requests with hundreds of rows.
  const UPSERT_BATCH_SIZE = 200;
  let upsertedCount = 0;

  for (let i = 0; i < upsertRows.length; i += UPSERT_BATCH_SIZE) {
    const batch = upsertRows.slice(i, i + UPSERT_BATCH_SIZE);
    console.log(
      `[steam-sync] Upserting batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}` +
      ` of ${Math.ceil(upsertRows.length / UPSERT_BATCH_SIZE)}` +
      ` (${batch.length} rows)`
    );
    const { error: upsertErr } = await admin
      .from("user_steam_data")
      .upsert(batch, { onConflict: "user_id,steam_app_id" });
    if (upsertErr) {
      console.error("[steam-sync] upsert error:", upsertErr);
      continue; // non-fatal — attempt remaining batches
    }
    upsertedCount += batch.length;
  }

  console.log(`[steam-sync] upserted ${upsertedCount}/${upsertRows.length} rows for user=${userId}`);

  return json({
    games_owned:      ownedGames.length,
    games_matched:    matched.length,
    games_discovered: gamesDiscovered,
    new_titles:       newTitles,
    synced_at:        now,
  });
});
