// apps/web/app/api/steam/sync/route.ts
// Triggers a Steam library sync for the currently logged-in user.
// Calls the steam-sync Edge Function and returns the summary to the client.

import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get fresh session after getUser() validates and refreshes it
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return Response.json({ error: "No session" }, { status: 401 });
    }

    // Get the user's steam_id from their profile.
    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("steam_id")
      .eq("id", user.id)
      .maybeSingle();
    const steamId = (rawProfile as { steam_id: string | null } | null)?.steam_id ?? null;

    if (!steamId) {
      return Response.json({ error: "No Steam account connected" }, { status: 400 });
    }

    // Call the steam-sync Edge Function with the user's session token so the
    // function can authenticate via admin.auth.getUser(jwt).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const fetchUrl = `${supabaseUrl}/functions/v1/steam-sync?apikey=${anonKey}`;

    const syncRes = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ steam_id: steamId }),
    });

    const body = await syncRes.text();

    if (!syncRes.ok) {
      return Response.json(
        { error: `Sync failed: ${syncRes.status} ${body}` },
        { status: 502 }
      );
    }

    const summary = JSON.parse(body);
    return Response.json(summary);
  } catch (error) {
    console.error('steam sync route error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
