import { createClient } from "@supabase/supabase-js";
import type { Database } from "@waypoint/types";

// On the server (Node.js / Edge runtime) the plain vars are available.
// In the browser only NEXT_PUBLIC_ / EXPO_PUBLIC_ vars survive bundling,
// so fall back to those when the bare names are absent.
const supabaseUrl =
  process.env["SUPABASE_URL"] ??
  process.env["NEXT_PUBLIC_SUPABASE_URL"] ??
  process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
  "";

const supabaseAnonKey =
  process.env["SUPABASE_ANON_KEY"] ??
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ??
  process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ??
  "";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
