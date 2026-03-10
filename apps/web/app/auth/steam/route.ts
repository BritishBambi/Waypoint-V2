// apps/web/app/auth/steam/route.ts
// Initiates a Steam OpenID 2.0 authentication flow.
// The user is redirected to Steam's login page; Steam sends them back to
// /auth/steam/callback once authenticated.

import { redirect } from "next/navigation";

export async function GET() {
  const params = new URLSearchParams({
    "openid.ns":         "http://specs.openid.net/auth/2.0",
    "openid.mode":       "checkid_setup",
    "openid.return_to":  process.env.STEAM_CALLBACK_URL!,
    "openid.realm":      "https://waypoint-v2-web.vercel.app",
    "openid.identity":   "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  redirect(`https://steamcommunity.com/openid/login?${params}`);
}
