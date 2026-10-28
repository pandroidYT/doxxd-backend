import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "./db/client.js";
import { likes, posts, users } from "./db/schema.js";

/**
 * The single place posts are read from. The author's identity is only selected
 * once the post has been doxxed, so an anonymous author can't leak through any
 * endpoint that uses this.
 */
export function selectPosts(db: Db, viewerId: string | null) {
  const author = alias(users, "author");
  const doxxer = alias(users, "doxxer");
  const isDoxxed = sql`${posts.doxxedAt} is not null`;

  return db
    .select({
      id: posts.id,
      parentId: posts.parentId,
      content: posts.content,
      alias: posts.alias,
      createdAt: posts.createdAt,
      doxxedAt: posts.doxxedAt,
      authorUsername: sql<string | null>`case when ${isDoxxed} then ${author.username} end`,
      authorColor: sql<string | null>`case when ${isDoxxed} then ${author.avatarColor} end`,
      doxxerUsername: doxxer.username,
      doxxerColor: doxxer.avatarColor,
      likeCount: sql<number>`(select count(*)::int from ${likes} where ${likes.postId} = ${posts.id})`,
      replyCount: sql<number>`(select count(*)::int from posts r where r.parent_id = ${posts.id})`,
      likedByMe: viewerId
        ? sql<boolean>`exists(select 1 from ${likes} where ${likes.postId} = ${posts.id} and ${likes.userId} = ${viewerId})`
        : sql<boolean>`false`,
      isMine: viewerId ? sql<boolean>`${posts.authorId} = ${viewerId}` : sql<boolean>`false`,
    })
    .from(posts)
    .innerJoin(author, eq(author.id, posts.authorId))
    .leftJoin(doxxer, eq(doxxer.id, posts.doxxedById))
    .$dynamic();
}

type PostRow = Awaited<ReturnType<ReturnType<typeof selectPosts>["execute"]>>[number];

export function toPostDto(r: PostRow) {
  return {
    id: r.id,
    parentId: r.parentId,
    content: r.content,
    alias: r.alias,
    createdAt: r.createdAt,
    author: r.authorUsername ? { username: r.authorUsername, avatarColor: r.authorColor! } : null,
    doxxed: r.doxxedAt
      ? {
          at: r.doxxedAt,
          // null when the doxxer has since deleted their account
          by: r.doxxerUsername ? { username: r.doxxerUsername, avatarColor: r.doxxerColor! } : null,
        }
      : null,
    likeCount: r.likeCount,
    replyCount: r.replyCount,
    likedByMe: r.likedByMe,
    isMine: r.isMine,
  };
}

export type PostDto = ReturnType<typeof toPostDto>;
