import postgres from "postgres";
import { runMigrations } from "../src/db/migrate.js";
import { TEST_DATABASE_URL } from "./env.js";

export async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";

  const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
    await admin.unsafe(`create database "${dbName}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(TEST_DATABASE_URL);
}
