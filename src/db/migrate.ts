import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Brings the database schema up to date. Safe to run on every start. */
export function runMigrations(db: Db) {
  return migrate(db, { migrationsFolder });
}
