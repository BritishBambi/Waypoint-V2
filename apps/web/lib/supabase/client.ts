import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@waypoint/types";

// @supabase/ssr 0.5.x doesn't handle the __InternalSupabase: { PostgrestVersion: "14.1" }
// marker that Supabase's type generator adds to the Database type. Passing the full
// Database type causes PostgREST to resolve all table types as `never`, breaking every
// mutation and typed query. Stripping the key restores correct inference while preserving
// the full schema type for all table operations.
type Schema = Omit<Database, "__InternalSupabase">;

export function createClient() {
  return createBrowserClient<Schema>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
