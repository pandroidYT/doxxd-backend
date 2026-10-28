import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "../src/db/schema.js";
import { setupApp } from "./helpers.js";

const { db, call, signup, createPost } = setupApp();

describe("anonymous posting", () => {
  it("never reveals who wrote an un-doxxed post", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const post = await createPost(alice, "nobody knows it's me");

    expect(post).toMatchObject({ content: "nobody knows it's me", author: null, doxxed: null, isMine: true });
    expect(post.alias).toMatch(/^\w+ \w+ #\d{4}$/);

    for (const token of [bob, undefined]) {
      const feed = await call("GET", "/posts", { token });
      const raw = JSON.stringify(feed.body);
      expect(raw).not.toContain("alice");
      expect(feed.body.posts[0]).toMatchObject({ author: null, isMine: false });
    }

    // Alice's public profile doesn't list her anonymous post either.
    const profile = await call("GET", "/users/alice");
    expect(profile.body.exposedPosts).toEqual([]);
    expect(JSON.stringify(profile.body)).not.toContain("nobody knows");
  });

  it("lets you see your own posts", async () => {
    const alice = await signup("alice");
    await createPost(alice, "one");
    await createPost(alice, "two");
    const mine = await call("GET", "/me/posts", { token: alice });
    expect(mine.body.posts.map((p: { content: string }) => p.content)).toEqual(["two", "one"]);
  });

  it("requires login to post and validates length", async () => {
    expect((await call("POST", "/posts", { body: { content: "hi" } })).status).toBe(401);
    const alice = await signup("alice");
    expect((await call("POST", "/posts", { token: alice, body: { content: "   " } })).status).toBe(400);
    expect((await call("POST", "/posts", { token: alice, body: { content: "x".repeat(281) } })).status).toBe(400);
  });

  it("paginates the feed without skipping or repeating posts", async () => {
    const alice = await signup("alice");
    for (let i = 0; i < 45; i++) await createPost(alice, `post ${i}`);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await call("GET", `/posts${cursor ? `?cursor=${cursor}` : ""}`);
      seen.push(...res.body.posts.map((p: { content: string }) => p.content));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
    expect(seen[0]).toBe("post 44");
  });

  it("supports replies, and notifies the parent's author without naming the replier", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const parent = await createPost(alice, "hot take");
    await createPost(bob, "cold take", parent.id);

    const thread = await call("GET", `/posts/${parent.id}`);
    expect(thread.body.post.replyCount).toBe(1);
    expect(thread.body.replies[0]).toMatchObject({ content: "cold take", author: null });

    // Replies stay out of the main feed.
    const feed = await call("GET", "/posts");
    expect(feed.body.posts).toHaveLength(1);

    const notes = await call("GET", "/notifications", { token: alice });
    expect(notes.body.notifications[0]).toMatchObject({ type: "reply", actor: null });
    expect(JSON.stringify(notes.body)).not.toContain("bob");
  });

  it("likes and unlikes", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const post = await createPost(alice, "like me");

    expect((await call("POST", `/posts/${post.id}/like`, { token: bob })).body).toEqual({ liked: true, likeCount: 1 });
    expect((await call("POST", `/posts/${post.id}/like`, { token: bob })).body).toEqual({ liked: true, likeCount: 1 });
    expect((await call("DELETE", `/posts/${post.id}/like`, { token: bob })).body).toEqual({ liked: false, likeCount: 0 });
  });

  it("only lets the author delete a post", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const post = await createPost(alice, "delete me");
    expect((await call("DELETE", `/posts/${post.id}`, { token: bob })).status).toBe(404);
    expect((await call("DELETE", `/posts/${post.id}`, { token: alice })).status).toBe(204);
    expect((await call("GET", `/posts/${post.id}`)).status).toBe(404);
  });

  it("404s on malformed ids", async () => {
    expect((await call("GET", "/posts/not-a-uuid")).status).toBe(404);
  });
});

describe("doxxing", () => {
  it("unmasks the author for everyone, credits the doxxer, and notifies the victim", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const post = await createPost(alice, "secret opinion");

    const dox = await call("POST", `/posts/${post.id}/dox`, { token: bob });
    expect(dox.status).toBe(200);
    expect(dox.body.doxTokens).toBe(2);
    expect(dox.body.post.author).toMatchObject({ username: "alice" });
    expect(dox.body.post.doxxed.by).toMatchObject({ username: "bob" });

    // Logged-out visitors see it too.
    const pub = await call("GET", `/posts/${post.id}`);
    expect(pub.body.post.author.username).toBe("alice");

    const exposed = await call("GET", "/posts?filter=doxxed");
    expect(exposed.body.posts.map((p: { id: string }) => p.id)).toEqual([post.id]);

    const profile = await call("GET", "/users/alice");
    expect(profile.body.user).toMatchObject({ username: "alice", timesDoxxed: 1, doxxesMade: 0 });
    expect(profile.body.exposedPosts).toHaveLength(1);
    expect(profile.body.user).not.toHaveProperty("email");
    expect((await call("GET", "/users/bob")).body.doxxedByThem).toHaveLength(1);

    const notes = await call("GET", "/notifications", { token: alice });
    expect(notes.body.notifications[0]).toMatchObject({ type: "doxxed", actor: { username: "bob" } });

    // Alice got a revenge token.
    expect((await call("GET", "/me", { token: alice })).body.user.doxTokens).toBe(4);

    const board = await call("GET", "/leaderboard");
    expect(board.body.mostDoxxed[0]).toMatchObject({ username: "alice", count: 1 });
    expect(board.body.topDoxxers[0]).toMatchObject({ username: "bob", count: 1 });
  });

  it("can't dox yourself or the same post twice", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const carol = await signup("carol");
    const post = await createPost(alice, "hmm");

    expect((await call("POST", `/posts/${post.id}/dox`, { token: alice })).status).toBe(400);
    expect((await call("POST", `/posts/${post.id}/dox`, { token: bob })).status).toBe(200);
    expect((await call("POST", `/posts/${post.id}/dox`, { token: carol })).status).toBe(409);
    // Failed attempts don't cost a token.
    expect((await call("GET", "/me", { token: carol })).body.user.doxTokens).toBe(3);
  });

  it("only one of several simultaneous doxxers wins", async () => {
    const alice = await signup("alice");
    const doxxers = await Promise.all(["bob1", "bob2", "bob3", "bob4"].map(signup));
    const post = await createPost(alice, "race");

    const results = await Promise.all(doxxers.map((token) => call("POST", `/posts/${post.id}/dox`, { token })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
  });

  it("runs out of tokens, and refills them the next day", async () => {
    const alice = await signup("alice");
    const bob = await signup("bob");
    const targets = [];
    for (let i = 0; i < 4; i++) targets.push(await createPost(alice, `post ${i}`));

    for (const t of targets.slice(0, 3)) expect((await call("POST", `/posts/${t.id}/dox`, { token: bob })).status).toBe(200);
    const broke = await call("POST", `/posts/${targets[3].id}/dox`, { token: bob });
    expect(broke.status).toBe(403);
    // The failed attempt didn't unmask the post.
    expect((await call("GET", `/posts/${targets[3].id}`)).body.post.author).toBeNull();

    // Pretend a day has passed.
    await db.update(users).set({ tokensRefilledOn: sql`current_date - 1` });
    expect((await call("GET", "/me", { token: bob })).body.user.doxTokens).toBe(3);
    expect((await call("POST", `/posts/${targets[3].id}/dox`, { token: bob })).status).toBe(200);
  });
});
