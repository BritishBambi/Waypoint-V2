// apps/web/app/api/steam/sync/route.ts
// Triggers a Steam library sync for the currently logged-in user.
// Calls the steam-sync Edge Function and returns the summary to the client.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();

    const [{ data: { user } }, { data: { session } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);

    if (!user || !session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the user's steam_id from their profile.
    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("steam_id")
      .eq("id", user.id)
      .maybeSingle();
    const steamId = (rawProfile as { steam_id: string | null } | null)?.steam_id ?? null;

    if (!steamId) {
      return NextResponse.json({ error: "No Steam account connected" }, { status: 400 });
    }

    // Call the steam-sync Edge Function with the user's session token so the
    // function can authenticate via admin.auth.getUser(jwt).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    console.log('anon key present:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    console.log('headers being sent:', {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10) + '...',
    });

    const syncRes = await fetch(`${supabaseUrl}/functions/v1/steam-sync`, {
      method: "POST",
      headers: {
        "apikey":        anonKey,
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ steam_id: steamId }),
    });

    console.log('edge function response status:', syncRes.status);
    const body = await syncRes.text();
    console.log('edge function response body:', body);

    if (!syncRes.ok) {
      return NextResponse.json(
        { error: `Sync failed: ${syncRes.status} ${body}` },
        { status: 502 }
      );
    }

    const summary = JSON.parse(body);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('steam sync route error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
