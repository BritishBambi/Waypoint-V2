// apps/web/app/api/steam/disconnect/route.ts
// Clears all Steam fields from the current user's profile row.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await (supabase as any)
    .from("profiles")
    .update({
      steam_id:           null,
      steam_display_name: null,
      steam_avatar_url:   null,
      steam_connected_at: null,
    })
    .eq("id", user.id);

  return NextResponse.json({ success: true });
}
