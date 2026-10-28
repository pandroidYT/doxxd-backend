import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, type Deps, requireUser } from "../context.js";
import { notifications, posts, users } from "../db/schema.js";
import { fail, parseBody } from "../lib/http.js";
import { AVATAR_COLORS } from "../lib/random.js";
import { selectPosts, toPostDto } from "../posts.js";
import { nextRefillAt, refillTokens } from "../tokens.js";

const updateMeSchema = z.object({
  bio: z.string().trim().max(160, "Bio can be at most 160 characters.").optional(),
  avatarColor: z.enum(AVATAR_COLORS as [string, ...string[]], "Pick one of the available colors.").optional(),
});

const deleteMeSchema = z.object({ password: z.string().min(1, "Enter your password to confirm.") });

export function userRoutes({ db, auth }: Deps) {
  const app = new Hono<AppEnv>();

  async function doxStats(userId: string) {
    const [timesDoxxed, doxxesMade] = await Promise.all([
      db.$count(posts, and(eq(posts.authorId, userId), isNotNull(posts.doxxedAt))),
      db.$count(posts, eq(posts.doxxedById, userId)),
    ]);
    return { timesDoxxed, doxxesMade };
  }

  app.get("/me", async (c) => {
    const me = requireUser(c);
    await refillTokens(db, me);
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        bio: users.bio,
        avatarColor: users.avatarColor,
        doxTokens: users.doxTokens,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, me));
    const [unread] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, me), isNull(notifications.readAt)));
    return c.json({
      user: { ...user!, ...(await doxStats(me)), unreadNotifications: unread!.n, nextRefillAt: nextRefillAt() },
    });
  });

  app.patch("/me", async (c) => {
    const me = requireUser(c);
    const body = await parseBody(c, updateMeSchema);
    if (Object.keys(body).length) await db.update(users).set(body).where(eq(users.id, me));
    return c.json({ ok: true });
  });

  app.delete("/me", async (c) => {
    const me = requireUser(c);
    const { password } = await parseBody(c, deleteMeSchema);
    const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me));
    if (!user || !(await auth.checkPassword(password, user.passwordHash))) fail(401, "Wrong password.");
    await db.delete(users).where(eq(users.id, me));
    return c.body(null, 204);
  });

  // Your own posts, anonymous or not. Only ever shown to you.
  app.get("/me/posts", async (c) => {
    const me = requireUser(c);
    const rows = await selectPosts(db, me).where(eq(posts.authorId, me)).orderBy(desc(posts.createdAt)).limit(100);
    return c.json({ posts: rows.map(toPostDto) });
  });

  // A public profile only ever lists posts that have already been doxxed.
  app.get("/users/:username", async (c) => {
    const [user] = await db
      .select({ id: users.id, username: users.username, bio: users.bio, avatarColor: users.avatarColor, createdAt: users.createdAt })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${c.req.param("username")})`);
    if (!user) fail(404, "No one goes by that name here.");

    const viewerId = c.get("userId");
    const [exposed, doxxes] = await Promise.all([
      selectPosts(db, viewerId)
        .where(and(eq(posts.authorId, user.id), isNotNull(posts.doxxedAt)))
        .orderBy(desc(posts.doxxedAt))
        .limit(50),
      selectPosts(db, viewerId).where(eq(posts.doxxedById, user.id)).orderBy(desc(posts.doxxedAt)).limit(50),
    ]);

    const { id, ...profile } = user;
    return c.json({
      user: { ...profile, ...(await doxStats(id)) },
      exposedPosts: exposed.map(toPostDto),
      doxxedByThem: doxxes.map(toPostDto),
    });
  });

  app.get("/notifications", async (c) => {
    const me = requireUser(c);
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        postId: notifications.postId,
        snippet: sql<string | null>`left(${posts.content}, 120)`,
        actorUsername: users.username,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(posts, eq(posts.id, notifications.postId))
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(eq(notifications.userId, me))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return c.json({
      notifications: rows.map(({ actorUsername, ...n }) => ({
        ...n,
        // Whoever replied is anonymous; only a doxxer is named.
        actor: n.type === "doxxed" && actorUsername ? { username: actorUsername } : null,
      })),
    });
  });

  app.post("/notifications/read", async (c) => {
    const me = requireUser(c);
    await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.userId, me), isNull(notifications.readAt)));
    return c.json({ ok: true });
  });

  app.get("/leaderboard", async (c) => {
    const leaders = (column: typeof posts.authorId | typeof posts.doxxedById) =>
      db
        .select({ username: users.username, avatarColor: users.avatarColor, count: count() })
        .from(posts)
        .innerJoin(users, eq(users.id, column))
        .where(isNotNull(posts.doxxedAt))
        .groupBy(users.id)
        .orderBy(desc(count()), users.username)
        .limit(10);

    const [mostDoxxed, topDoxxers] = await Promise.all([leaders(posts.authorId), leaders(posts.doxxedById)]);
    return c.json({ mostDoxxed, topDoxxers });
  });

  return app;
}
