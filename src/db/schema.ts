import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    bio: text("bio").notNull().default(""),
    avatarColor: text("avatar_color").notNull(),
    doxTokens: integer("dox_tokens").notNull().default(3),
    // UTC date of the last daily token refill.
    tokensRefilledOn: date("tokens_refilled_on")
      .notNull()
      .default(sql`(now() at time zone 'utc')::date`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => posts.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // Random per-post pseudonym shown while the post is still anonymous.
    alias: text("alias").notNull(),
    doxxedById: uuid("doxxed_by_id").references(() => users.id, { onDelete: "set null" }),
    doxxedAt: timestamp("doxxed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("posts_created_at_idx").on(t.createdAt),
    index("posts_parent_id_idx").on(t.parentId),
    index("posts_author_id_idx").on(t.authorId),
    index("posts_doxxed_by_id_idx").on(t.doxxedById),
  ],
);

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("likes_post_id_idx").on(t.postId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["doxxed", "reply"] }).notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    // Who caused it. Only exposed for "doxxed" — a reply's author stays anonymous.
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_id_idx").on(t.userId, t.createdAt)],
);
