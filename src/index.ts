import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";
import { createAuth } from "./lib/auth.js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name} (see .env.example)`);
    process.exit(1);
  }
  return value;
}

const jwtSecret = env("JWT_SECRET");
if (jwtSecret.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

const { db } = createDb(env("DATABASE_URL"));
const app = createApp({
  db,
  auth: createAuth(jwtSecret),
  corsOrigins: process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`DoXXd API listening on http://localhost:${port}`));
