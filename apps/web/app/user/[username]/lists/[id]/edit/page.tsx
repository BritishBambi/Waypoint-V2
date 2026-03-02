// apps/web/app/user/[username]/lists/[id]/edit/page.tsx
// Edit an existing list. Auth-gated + ownership check.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ListForm, type ListEntry } from "@/app/lists/ListForm";

export default async function EditListPage({
  params,
}: {
  params: { username: string; id: string };
}) {
  const { username, id } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Profile lookup
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();
  const profile = rawProfile as { id: string; username: string } | null;
  if (!profile) notFound();

  // Must be own profile
  if (user.id !== profile.id) redirect(`/user/${username}/lists/${id}`);

  // List lookup
  const { data: rawList } = await supabase
    .from("lists")
    .select("id, title, description, is_ranked, is_public")
    .eq("id", id)
    .eq("user_id", profile.id)
    .maybeSingle();
  const list = rawList as {
    id: string; title: string; description: string | null;
    is_ranked: boolean; is_public: boolean;
  } | null;
  if (!list) notFound();

  // Existing entries — include game data for pre-populating the form
  const { data: rawEntries } = await supabase
    .from("list_entries")
    .select("position, note, games(id, slug, title, cover_url, release_date)")
    .eq("list_id", id)
    .order("position", { ascending: true, nullsFirst: false });

  const entries: ListEntry[] = (
    (rawEntries ?? []) as unknown as Array<{
      position: number | null;
      note: string | null;
      games: {
        id: number;
        slug: string;
        title: string;
        cover_url: string | null;
        release_date: string | null;
      } | null;
    }>
  )
    .filter((e) => e.games !== null)
    .map((e) => ({
      game_id: e.games!.id,
      slug: e.games!.slug,
      title: e.games!.title,
      cover_url: e.games!.cover_url,
      release_year: e.games!.release_date ? e.games!.release_date.slice(0, 4) : null,
      note: e.note ?? "",
    }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-white">Edit List</h1>
      <ListForm
        mode="edit"
        listId={id}
        username={username}
        initialData={{
          title: list.title,
          description: list.description ?? "",
          is_public: list.is_public,
          is_ranked: list.is_ranked,
          entries,
        }}
      />
    </main>
  );
}
