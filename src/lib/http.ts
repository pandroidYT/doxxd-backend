import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

export function fail(status: 400 | 401 | 403 | 404 | 409 | 429, message: string): never {
  throw new HTTPException(status, { message });
}

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => fail(400, "Request body must be JSON"));
  const result = schema.safeParse(raw);
  if (!result.success) fail(400, result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}

function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
}

/**
 * Simple in-memory fixed-window limiter. Good enough for a single server;
 * swap for a Redis-backed one if this ever runs on several instances.
 */
export function rateLimit(opts: { name: string; limit: number; windowMs: number }): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    const key = `${opts.name}:${clientIp(c)}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (++entry.count > opts.limit) fail(429, "Slow down — too many requests. Try again in a bit.");
    await next();
  };
}
