import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createAuth } from "./lib/auth.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = resolve(root, process.env.DATA_DIR ?? "data");
const frontendDir = resolve(root, process.env.FRONTEND_DIR ?? "../doxxd-frontend/dist");
const port = Number(process.env.PORT ?? 3000);

mkdirSync(dataDir, { recursive: true });
console.log("Starting DoXXd… (the very first start takes a few seconds)");

// The key that signs login tokens. Made once and kept in the data folder.
function loadJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = resolve(dataDir, "jwt-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString("base64url"), { mode: 0o600 });
  return readFileSync(file, "utf8").trim();
}

const { db } = createDb(resolve(dataDir, "db"));
await runMigrations(db);

const hasFrontend = existsSync(resolve(frontendDir, "index.html"));
const app = createApp({
  db,
  auth: createAuth(loadJwtSecret()),
  corsOrigins: process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
  frontendDir: hasFrontend ? frontendDir : undefined,
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n  DoXXd is running → http://localhost:${port}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) console.log(`  On your network  → http://${net.address}:${port}`);
    }
  }
  if (!hasFrontend) {
    console.log(`\n  (API only: no website found at ${frontendDir}. Run "npm run setup" to build it.)`);
  }
  console.log(`\n  Data is saved in ${dataDir}. Press Ctrl+C to stop.\n`);
});
