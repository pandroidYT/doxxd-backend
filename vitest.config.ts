import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PGlite takes a moment to boot; each test file gets its own in-memory database.
    hookTimeout: 30_000,
  },
});
