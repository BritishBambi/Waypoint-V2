// apps/web/app/user/[username]/edit/page.tsx
// Server Component: verify the current user owns this profile before
// rendering the edit form. Anyone else is redirected to the public profile.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditProfileForm } from "./EditProfileForm";

export default async function EditProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = params;
  const supabase = await createClient();

  // Run auth check and profile lookup in parallel.
  const [{ data: { user } }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle(),
  ]);

  // Not logged in, or profile doesn't exist, or logged-in user isn't the owner
  // → silently redirect to the public profile page.
  if (!user || !profile || user.id !== profile.id) {
    redirect(`/user/${username}`);
  }

  return <EditProfileForm profile={profile} />;
}
