// apps/web/app/auth/steam/callback/route.ts
// Handles the Steam OpenID 2.0 callback after a user authenticates on Steam.
//
// Flow:
//   1. Re-send all params back to Steam with openid.mode=check_authentication
//   2. Verify the "is_valid:true" response
//   3. Extract the SteamID64 from openid.claimed_id
//   4. Fetch the Steam profile via the Web API
//   5. Update the user's Supabase profile row
//   6. Redirect to /user/[username]/edit?steam=connected

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // ── 1. Verify the OpenID assertion ──────────────────────────────────────────
  // Forward every param Steam sent back, but override openid.mode.
  const verifyParams = new URLSearchParams();
  for (const [key, value] of searchParams) {
    verifyParams.set(key, value);
  }
  verifyParams.set("openid.mode", "check_authentication");

  let verifyText: string;
  try {
    const verifyRes = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyParams.toString(),
    });
    verifyText = await verifyRes.text();
  } catch {
    return NextResponse.redirect(`${origin}/login?error=Steam+verification+failed`);
  }

  if (!verifyText.includes("is_valid:true")) {
    return NextResponse.redirect(`${origin}/login?error=Steam+authentication+invalid`);
  }

  // ── 2. Extract SteamID64 ─────────────────────────────────────────────────────
  // claimed_id = https://steamcommunity.com/openid/id/76561198XXXXXXXXX
  const claimedId = searchParams.get("openid.claimed_id") ?? "";
  const steamId   = claimedId.split("/").pop() ?? "";

  if (!steamId || !/^\d+$/.test(steamId)) {
    return NextResponse.redirect(`${origin}/login?error=Invalid+Steam+ID`);
  }

  // ── 3. Fetch Steam profile ───────────────────────────────────────────────────
  const steamApiKey = process.env.STEAM_API_KEY;
  if (!steamApiKey) {
    return NextResponse.redirect(`${origin}/login?error=Steam+API+key+not+configured`);
  }

  let player: {
    personaname: string;
    avatarfull: string;
    communityvisibilitystate: number;
  } | undefined;

  try {
    const profileRes  = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${steamId}`
    );
    const profileData = await profileRes.json();
    player = profileData?.response?.players?.[0];
  } catch {
    return NextResponse.redirect(`${origin}/login?error=Failed+to+fetch+Steam+profile`);
  }

  if (!player) {
    return NextResponse.redirect(`${origin}/login?error=Steam+profile+not+found`);
  }

  // ── 4. Get current Supabase user ─────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=Not+authenticated`);
  }

  // ── 5. Fetch username for redirect ───────────────────────────────────────────
  const { data: rawProfileRow } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const username = (rawProfileRow as { username: string } | null)?.username ?? "";

  // ── 6. Update profile with Steam data ────────────────────────────────────────
  await (supabase as any)
    .from("profiles")
    .update({
      steam_id:           steamId,
      steam_display_name: player.personaname,
      steam_avatar_url:   player.avatarfull,
      steam_connected_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  // ── 7. Fire-and-forget Steam library sync ────────────────────────────────────
  // Kick off a sync immediately after connecting — don't await so the redirect
  // isn't delayed. The user's session token is needed by steam-sync to auth.
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    fetch(`${supabaseUrl}/functions/v1/steam-sync`, {
      method: "POST",
      headers: {
        "apikey":        anonKey,
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ steam_id: steamId }),
    }).catch(console.error);
  }

  // ── 8. Redirect back to edit profile ─────────────────────────────────────────
  // Append ?steam_private=1 if the user's Steam profile is not public so the
  // edit page can show a privacy warning without a second API round-trip.
  const isPrivate = player.communityvisibilitystate !== 3;
  const editUrl   = `/user/${username}/edit?steam=connected${isPrivate ? "&steam_private=1" : ""}`;

  return NextResponse.redirect(`${origin}${editUrl}`);
}
