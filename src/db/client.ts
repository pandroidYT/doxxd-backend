import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema.js";

/**
 * Postgres running inside this process (PGlite), so there's no database server to install.
 * Data is saved in `dataDir`; leave it out for a throwaway in-memory database.
 */
export function createDb(dataDir?: string) {
  const client = new PGlite(dataDir);
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
