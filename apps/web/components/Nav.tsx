import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/NotificationBell";


export async function Nav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let username: string | null = null;
  let avatarUrl: string | null = null;
  if (user) {
    const { data: rawData } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single();
    // Explicit cast — PostgrestVersion 14.1 inference regression
    const data = rawData as { username: string; avatar_url: string | null } | null;
    username = data?.username ?? null;
    avatarUrl = data?.avatar_url ?? null;
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="rounded px-2 py-2 text-2xl font-bold tracking-tight text-white hover:text-zinc-200"
        >
          Waypoint
        </Link>

        <div className="flex items-center gap-2">
          {username && user ? (
            <>
              <NotificationBell userId={user.id} />
              <UserMenu username={username} avatarUrl={avatarUrl} />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
            >
              Log In
            </Link>
          )}

          <Link
            href="/search?tab=games"
            aria-label="Search"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}
