// supabase/functions/steam-sync/index.ts
// Syncs a user's Steam library into user_steam_data:
//   - Owned games + playtime from Steam API
//   - Achievement counts for games already in the Waypoint games table
//
// Secrets required:
//   STEAM_API_KEY                   — Steam Web API key
//   SUPABASE_URL                    — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY       — auto-provided

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ─── Title award map ──────────────────────────────────────────────────────────
// Steam AppID → title slug for 100% completion awards.

const STEAM_APP_TITLE_MAP: Record<number, string> = {
  620:     "portal-2-tester",
  367520:  "hollow-knight-vessel",
  504230:  "celeste-mountain",
  1145360: "hades-champion",
  292030:  "the-witcher-3-master",
  1245620: "elden-ring-sovereign",
  588650:  "dead-cells-beheaded",
  814380:  "sekiro-wolf",
  413150:  "stardew-valley-farmer",
  268910:  "cuphead-hero",
};

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

  const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const steamApiKey      = Deno.env.get("STEAM_API_KEY");

  console.log('env check:', {
    supabase_url_present:  !!Deno.env.get("SUPABASE_URL"),
    service_role_present:  !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    steam_key_present:     !!Deno.env.get("STEAM_API_KEY"),
  });

  if (!steamApiKey) {
    return json({ error: "STEAM_API_KEY not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verify the JWT and get the calling user's ID.
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

  // ── 3. Fetch owned games from Steam ─────────────────────────────────────────
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
    return json({ games_owned: 0, games_matched: 0, synced_at: new Date().toISOString() });
  }

  // ── 4. Match against games table via steam_app_id ───────────────────────────
  const ownedAppIds = ownedGames.map((g) => g.appid);

  const { data: matchedRows } = await admin
    .from("games")
    .select("id, steam_app_id")
    .in("steam_app_id", ownedAppIds);

  const matched = (matchedRows ?? []) as Array<{ id: number; steam_app_id: number }>;
  console.log(`[steam-sync] matched=${matched.length} games in Waypoint DB`);

  if (matched.length === 0) {
    return json({
      games_owned: ownedGames.length,
      games_matched: 0,
      synced_at: new Date().toISOString(),
    });
  }

  // Build a lookup: appid → playtime_forever
  const playtimeByAppId = new Map<number, number>(
    ownedGames.map((g) => [g.appid, g.playtime_forever])
  );

  // ── 5. Fetch achievement stats for each matched game ─────────────────────────
  const upsertRows: Array<{
    user_id: string;
    game_id: number;
    steam_app_id: number;
    playtime_minutes: number;
    achievements_unlocked: number;
    achievements_total: number;
    last_synced_at: string;
  }> = [];

  const newTitles: Array<{ name: string; slug: string }> = [];

  const now = new Date().toISOString();

  for (const row of matched) {
    const appid    = row.steam_app_id;
    const playtime = playtimeByAppId.get(appid) ?? 0;

    let achievementsUnlocked = 0;
    let achievementsTotal    = 0;

    // Only fetch achievements if the user has actually played the game.
    if (playtime > 0) {
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
                user_id:               userId,
                steam_app_id:          appid,
                achievement_api_name:  pa.apiname,
                name:                  schema.displayName,
                description:           schema.description ?? null,
                icon_url:              schema.icon,
                icon_gray_url:         schema.icongray,
                unlocked:              pa.achieved === 1,
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
        // Non-200 on achRes = game has no achievements or private stats — silently skip.
      } catch (e) {
        console.error("[steam-sync] Achievement sync failed for appid:", appid, e);
        // Non-fatal — continue with next game.
      }

      // ── Title award: check for 100% completion ──────────────────────────────
      if (achievementsTotal > 0 && achievementsUnlocked === achievementsTotal) {
        const titleSlug = STEAM_APP_TITLE_MAP[appid];
        if (titleSlug) {
          try {
            const { data: titleRow } = await admin
              .from("titles")
              .select("id, name")
              .eq("slug", titleSlug)
              .maybeSingle();

            if (titleRow) {
              // Only insert if not already awarded (upsert would silently succeed too).
              const { data: existing } = await admin
                .from("user_titles")
                .select("title_id")
                .eq("user_id", userId)
                .eq("title_id", (titleRow as any).id)
                .maybeSingle();

              if (!existing) {
                await admin.from("user_titles").insert({
                  user_id:  userId,
                  title_id: (titleRow as any).id,
                });
                await admin.from("notifications").insert({
                  user_id:  userId,
                  actor_id: userId,
                  type:     "title_unlocked",
                  title_id: (titleRow as any).id,
                });
                newTitles.push({ name: (titleRow as any).name, slug: titleSlug });
              }
            }
          } catch (e) {
            console.error("[steam-sync] Title award failed for appid:", appid, e);
          }
        }
      }

      // Respect Steam API rate limit.
      await sleep(100);
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

  // ── 6. Upsert all rows ──────────────────────────────────────────────────────
  const { error: upsertErr } = await admin
    .from("user_steam_data")
    .upsert(upsertRows, { onConflict: "user_id,steam_app_id" });

  if (upsertErr) {
    console.error("[steam-sync] upsert error:", upsertErr);
    return json({ error: "Failed to save steam data" }, 500);
  }

  console.log(`[steam-sync] upserted ${upsertRows.length} rows for user=${userId}`);

  return json({
    games_owned:   ownedGames.length,
    games_matched: matched.length,
    new_titles:    newTitles,
    synced_at:     now,
  });
});
