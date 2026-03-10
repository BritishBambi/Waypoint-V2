// apps/web/app/user/[username]/edit/page.tsx
// Server Component: verify the current user owns this profile before
// rendering the edit form. Anyone else is redirected to the public profile.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@waypoint/types";
import { EditProfileForm } from "./EditProfileForm";

export default async function EditProfilePage({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { steam?: string; steam_private?: string };
}) {
  const { username } = params;
  const steamParam   = searchParams.steam         ?? null;
  const steamPrivate = searchParams.steam_private === "1";
  const supabase = await createClient();

  // Run auth check and profile lookup in parallel.
  const [{ data: { user } }, { data: rawProfile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle(),
  ]);

  // Cast — PostgrestVersion 14.1 makes maybeSingle() return never; see project MEMORY.
  const profile = rawProfile as Tables<"profiles"> | null;

  // Not logged in, or profile doesn't exist, or logged-in user isn't the owner
  // → silently redirect to the public profile page.
  if (!user || !profile || user.id !== profile.id) {
    redirect(`/user/${username}`);
  }

  return <EditProfileForm profile={profile} steamParam={steamParam} steamPrivate={steamPrivate} />;
}
