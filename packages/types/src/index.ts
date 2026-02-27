export type { Database, Json } from "./database";

import type { Database } from "./database";

type PublicTables = Database["public"]["Tables"];

/** The Row (SELECT) shape for a given table. */
export type Tables<T extends keyof PublicTables> =
  PublicTables[T]["Row"];

/** The Insert shape for a given table. */
export type Inserts<T extends keyof PublicTables> =
  PublicTables[T]["Insert"];

/** The Update (PATCH) shape for a given table. */
export type Updates<T extends keyof PublicTables> =
  PublicTables[T]["Update"];
