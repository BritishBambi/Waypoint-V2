// apps/web/app/lists/new/page.tsx
// Create a new list. Auth-gated — redirects to /login if not signed in.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ListForm } from "@/app/lists/ListForm";

export default async function NewListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get username so the form can redirect to the right profile after save.
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  const profile = rawProfile as { username: string } | null;
  if (!profile) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-white">Create a New List</h1>
      <ListForm mode="create" username={profile.username} />
    </main>
  );
}
