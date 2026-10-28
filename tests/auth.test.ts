import { describe, expect, it } from "vitest";
import { setupApp } from "./helpers.js";

const { call, signup } = setupApp();

describe("auth", () => {
  it("registers, logs in with username or email, and returns the profile", async () => {
    const reg = await call("POST", "/auth/register", {
      body: { username: "Alice", email: "Alice@Example.com", password: "password123" },
    });
    expect(reg.status).toBe(201);

    for (const login of ["alice", "ALICE", "alice@example.com"]) {
      const res = await call("POST", "/auth/login", { body: { login, password: "password123" } });
      expect(res.status, login).toBe(200);
    }

    const me = await call("GET", "/me", { token: reg.body.token });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ username: "Alice", email: "alice@example.com", doxTokens: 3, timesDoxxed: 0 });
    expect(me.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects wrong passwords and bad tokens", async () => {
    await signup("bob");
    const res = await call("POST", "/auth/login", { body: { login: "bob", password: "nope-nope" } });
    expect(res.status).toBe(401);
    expect((await call("GET", "/me", { token: "garbage" })).status).toBe(401);
    expect((await call("GET", "/me")).status).toBe(401);
  });

  it("refuses duplicate usernames regardless of case, and duplicate emails", async () => {
    await signup("carol");
    const dupeName = await call("POST", "/auth/register", {
      body: { username: "CAROL", email: "other@example.com", password: "password123" },
    });
    expect(dupeName.status).toBe(409);
    const dupeEmail = await call("POST", "/auth/register", {
      body: { username: "carol2", email: "carol@example.com", password: "password123" },
    });
    expect(dupeEmail.status).toBe(409);
  });

  it("validates input", async () => {
    const res = await call("POST", "/auth/register", {
      body: { username: "x", email: "x@example.com", password: "password123" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Username/);
  });

  it("rate limits repeated login attempts from one client", async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await call("POST", "/auth/login", { ip: "1.2.3.4", body: { login: "x", password: "y" } })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("deletes an account after confirming the password", async () => {
    const token = await signup("dave");
    expect((await call("DELETE", "/me", { token, body: { password: "wrong" } })).status).toBe(401);
    expect((await call("DELETE", "/me", { token, body: { password: "password123" } })).status).toBe(204);
    expect((await call("GET", "/me", { token })).status).toBe(401);
  });
});
