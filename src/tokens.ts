import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DAILY_DOX_TOKENS } from "./context.js";
import { users } from "./db/schema.js";

const utcToday = sql`(now() at time zone 'utc')::date`;

/** Tops a user's dox tokens back up to the daily amount once per UTC day. Bonus tokens are kept. */
export async function refillTokens(db: PgDatabase<PgQueryResultHKT, any, any>, userId: string) {
  await db
    .update(users)
    .set({ doxTokens: sql`greatest(${users.doxTokens}, ${DAILY_DOX_TOKENS})`, tokensRefilledOn: utcToday })
    .where(and(eq(users.id, userId), sql`${users.tokensRefilledOn} < ${utcToday}`));
}

export function nextRefillAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
