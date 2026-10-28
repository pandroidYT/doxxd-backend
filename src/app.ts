import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Deps } from "./context.js";
import { users } from "./db/schema.js";
import { authRoutes } from "./routes/auth.js";
import { postRoutes } from "./routes/posts.js";
import { userRoutes } from "./routes/users.js";

export function createApp(deps: Deps & { corsOrigins?: string[] }) {
  const { db, auth } = deps;
  const app = new Hono<AppEnv>();

  app.use("*", cors({ origin: deps.corsOrigins?.length ? deps.corsOrigins : "*" }));
  app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "Request too large." }, 413) }));

  // Resolve the logged-in user (if any) for every request.
  app.use("*", async (c, next) => {
    c.set("userId", null);
    const header = c.req.header("authorization");
    if (header?.startsWith("Bearer ")) {
      const id = await auth.verifyToken(header.slice(7));
      if (id) {
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
        if (user) c.set("userId", user.id);
      }
    }
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", authRoutes(deps));
  app.route("/posts", postRoutes(deps));
  app.route("/", userRoutes(deps));

  app.notFound((c) => c.json({ error: "Not found." }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Something went wrong on our end." }, 500);
  });

  return app;
}
