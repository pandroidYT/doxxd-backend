import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { createAuth } from "../src/lib/auth.js";
import { TEST_DATABASE_URL } from "./env.js";

/** Spins up the app against the test database, wiped before each test. */
export function setupApp() {
  const { db, client } = createDb(TEST_DATABASE_URL);
  const app = createApp({ db, auth: createAuth("test-secret-test-secret-test-secret") });

  beforeEach(async () => {
    await db.execute(sql`truncate users, posts, likes, notifications cascade`);
  });
  afterAll(() => client.end());

  // Each call looks like a different client so tests don't trip the rate limiter.
  async function call(method: string, path: string, opts: { token?: string; body?: unknown; ip?: string } = {}) {
    const headers: Record<string, string> = {
      "x-forwarded-for": opts.ip ?? `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`,
    };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await app.request(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function signup(username: string) {
    const res = await call("POST", "/auth/register", {
      body: { username, email: `${username.toLowerCase()}@example.com`, password: "password123" },
    });
    if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
    return res.body.token as string;
  }

  async function createPost(token: string, content: string, parentId?: string) {
    const res = await call("POST", "/posts", { token, body: { content, parentId } });
    if (res.status !== 201) throw new Error(`post failed: ${JSON.stringify(res.body)}`);
    return res.body.post;
  }

  return { app, db, call, signup, createPost };
}
