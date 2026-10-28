import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../context.js";
import { users } from "../db/schema.js";
import { fail, parseBody, rateLimit } from "../lib/http.js";
import { randomAvatarColor } from "../lib/random.js";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,20}$/, "Username must be 3–20 letters, numbers or underscores."),
  email: z.email("That email doesn't look right.").trim().toLowerCase(),
  // bcrypt only looks at the first 72 bytes
  password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password is too long."),
});

const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

export function authRoutes({ db, auth }: Deps) {
  const app = new Hono<AppEnv>();
  app.use("*", rateLimit({ name: "auth", limit: 10, windowMs: 60_000 }));

  app.post("/register", async (c) => {
    const body = await parseBody(c, registerSchema);

    const taken = await db
      .select({ username: users.username, email: users.email })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${body.username}) or ${users.email} = ${body.email}`);
    if (taken.some((u) => u.email === body.email)) fail(409, "An account with that email already exists.");
    if (taken.length) fail(409, "That username is taken.");

    const passwordHash = await auth.hashPassword(body.password);
    const [user] = await db
      .insert(users)
      .values({ username: body.username, email: body.email, passwordHash, avatarColor: randomAvatarColor() })
      .returning({ id: users.id })
      .catch((err) => (isUniqueViolation(err) ? fail(409, "That username or email is taken.") : Promise.reject(err)));

    return c.json({ token: await auth.signToken(user!.id) }, 201);
  });

  app.post("/login", async (c) => {
    const { login, password } = await parseBody(c, loginSchema);
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(login.includes("@") ? eq(users.email, login.toLowerCase()) : sql`lower(${users.username}) = lower(${login})`);

    if (!user || !(await auth.checkPassword(password, user.passwordHash))) {
      fail(401, "Wrong username/email or password.");
    }
    return c.json({ token: await auth.signToken(user.id) });
  });

  return app;
}
