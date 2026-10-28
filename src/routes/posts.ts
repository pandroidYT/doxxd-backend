import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, type Deps, MAX_DOX_TOKENS, requireUser } from "../context.js";
import { likes, notifications, posts, users } from "../db/schema.js";
import { fail, parseBody, rateLimit } from "../lib/http.js";
import { randomAlias } from "../lib/random.js";
import { selectPosts, toPostDto } from "../posts.js";
import { refillTokens } from "../tokens.js";

const PAGE_SIZE = 20;

const feedQuery = z.object({
  filter: z.enum(["all", "doxxed"]).default("all"),
  cursor: z.uuid().optional(),
});

const createSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Say something first.")
    .max(280, "Posts can be at most 280 characters."),
  parentId: z.uuid().optional(),
});

const idParam = z.uuid();

export function postRoutes({ db }: Deps) {
  const app = new Hono<AppEnv>();

  function postId(raw: string): string {
    const parsed = idParam.safeParse(raw);
    if (!parsed.success) fail(404, "Post not found.");
    return parsed.data;
  }

  async function loadPost(id: string, viewerId: string | null) {
    const [row] = await selectPosts(db, viewerId).where(eq(posts.id, id));
    if (!row) fail(404, "Post not found.");
    return toPostDto(row);
  }

  // Feed: newest top-level posts, or the "exposed" tab of everything that's been doxxed.
  app.get("/", async (c) => {
    const q = feedQuery.safeParse(c.req.query());
    if (!q.success) fail(400, "Invalid feed query.");
    const { filter, cursor } = q.data;

    const sortCol = filter === "doxxed" ? posts.doxxedAt : posts.createdAt;
    const conditions = [filter === "doxxed" ? isNotNull(posts.doxxedAt) : isNull(posts.parentId)];
    if (cursor) {
      // Keyset pagination on (sort column, id), compared in SQL so timestamps keep full precision.
      conditions.push(
        sql`(${sortCol}, ${posts.id}) < (select c.${sql.identifier(sortCol.name)}, c.id from posts c where c.id = ${cursor})`,
      );
    }

    const rows = await selectPosts(db, c.get("userId"))
      .where(and(...conditions))
      .orderBy(desc(sortCol), desc(posts.id))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE).map(toPostDto);
    return c.json({ posts: page, nextCursor: rows.length > PAGE_SIZE ? page.at(-1)!.id : null });
  });

  app.get("/:id", async (c) => {
    const viewerId = c.get("userId");
    const post = await loadPost(postId(c.req.param("id")), viewerId);
    const [parent, replies] = await Promise.all([
      post.parentId ? selectPosts(db, viewerId).where(eq(posts.id, post.parentId)) : Promise.resolve([]),
      selectPosts(db, viewerId).where(eq(posts.parentId, post.id)).orderBy(asc(posts.createdAt)).limit(200),
    ]);
    return c.json({ post, parent: parent[0] ? toPostDto(parent[0]) : null, replies: replies.map(toPostDto) });
  });

  app.post("/", rateLimit({ name: "post", limit: 10, windowMs: 60_000 }), async (c) => {
    const me = requireUser(c);
    const { content, parentId } = await parseBody(c, createSchema);

    const id = await db.transaction(async (tx) => {
      let parentAuthor: string | undefined;
      if (parentId) {
        const [parent] = await tx.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, parentId));
        if (!parent) fail(404, "The post you're replying to no longer exists.");
        parentAuthor = parent.authorId;
      }
      const [created] = await tx
        .insert(posts)
        .values({ authorId: me, parentId, content, alias: randomAlias() })
        .returning({ id: posts.id });
      if (parentAuthor && parentAuthor !== me) {
        await tx.insert(notifications).values({ userId: parentAuthor, type: "reply", postId: created!.id, actorId: me });
      }
      return created!.id;
    });

    return c.json({ post: await loadPost(id, me) }, 201);
  });

  app.delete("/:id", async (c) => {
    const me = requireUser(c);
    const deleted = await db
      .delete(posts)
      .where(and(eq(posts.id, postId(c.req.param("id"))), eq(posts.authorId, me)))
      .returning({ id: posts.id });
    if (!deleted.length) fail(404, "Post not found.");
    return c.body(null, 204);
  });

  async function likeState(id: string, me: string) {
    const post = await loadPost(id, me);
    return { liked: post.likedByMe, likeCount: post.likeCount };
  }

  app.post("/:id/like", async (c) => {
    const me = requireUser(c);
    const id = postId(c.req.param("id"));
    await loadPost(id, me);
    await db.insert(likes).values({ userId: me, postId: id }).onConflictDoNothing();
    return c.json(await likeState(id, me));
  });

  app.delete("/:id/like", async (c) => {
    const me = requireUser(c);
    const id = postId(c.req.param("id"));
    await db.delete(likes).where(and(eq(likes.userId, me), eq(likes.postId, id)));
    return c.json(await likeState(id, me));
  });

  // The whole point: spend a dox token to unmask who wrote a post, for everyone.
  app.post("/:id/dox", rateLimit({ name: "dox", limit: 20, windowMs: 60_000 }), async (c) => {
    const me = requireUser(c);
    const id = postId(c.req.param("id"));

    const tokensLeft = await db.transaction(async (tx) => {
      await refillTokens(tx, me);

      const [target] = await tx
        .update(posts)
        .set({ doxxedById: me, doxxedAt: sql`now()` })
        .where(and(eq(posts.id, id), isNull(posts.doxxedAt), sql`${posts.authorId} <> ${me}`))
        .returning({ authorId: posts.authorId });

      if (!target) {
        const [post] = await tx.select({ authorId: posts.authorId, doxxedAt: posts.doxxedAt }).from(posts).where(eq(posts.id, id));
        if (!post) fail(404, "Post not found.");
        if (post.doxxedAt) fail(409, "Too late — someone already doxxed this post.");
        fail(400, "You can't dox yourself.");
      }

      const [spent] = await tx
        .update(users)
        .set({ doxTokens: sql`${users.doxTokens} - 1` })
        .where(and(eq(users.id, me), sql`${users.doxTokens} > 0`))
        .returning({ doxTokens: users.doxTokens });
      if (!spent) fail(403, "You're out of dox tokens. They refill every day.");

      // The victim gets a revenge token.
      await tx
        .update(users)
        .set({ doxTokens: sql`least(${users.doxTokens} + 1, ${MAX_DOX_TOKENS})` })
        .where(eq(users.id, target.authorId));
      await tx.insert(notifications).values({ userId: target.authorId, type: "doxxed", postId: id, actorId: me });

      return spent.doxTokens;
    });

    return c.json({ post: await loadPost(id, me), doxTokens: tokensLeft });
  });

  return app;
}
