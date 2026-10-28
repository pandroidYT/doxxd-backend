import type { Context } from "hono";
import type { Db } from "./db/client.js";
import type { Auth } from "./lib/auth.js";
import { fail } from "./lib/http.js";

export type AppEnv = { Variables: { userId: string | null } };

export type Deps = { db: Db; auth: Auth };

/** Daily dox tokens everyone is topped back up to. */
export const DAILY_DOX_TOKENS = 3;
/** Getting doxxed grants a "revenge" token, up to this many in the bank. */
export const MAX_DOX_TOKENS = 10;

export function requireUser(c: Context<AppEnv>): string {
  const id = c.get("userId");
  if (!id) fail(401, "You need to be logged in for that.");
  return id;
}
