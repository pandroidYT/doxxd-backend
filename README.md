# DoXXd API

The backend for **DoXXd**: a social feed where every post is anonymous, until someone spends a dox token to unmask its author.

**Stack:** Node 22 · TypeScript · [Hono](https://hono.dev) · PostgreSQL · [Drizzle ORM](https://orm.drizzle.team) · Zod · Vitest

## How the game works

- Every post gets a random alias (e.g. `Masked Otter #0421`). The author's account is never sent to anyone else.
- Everyone has **3 dox tokens**, topped back up every day at midnight UTC.
- Spending a token on a post (`POST /posts/:id/dox`) unmasks its author **for everyone**, permanently. The doxxer is credited publicly too.
- You can't dox yourself or a post someone else already doxxed. Failed attempts don't cost a token.
- Getting doxxed earns you a **revenge token** (bonus tokens are kept through refills, up to 10).
- Public profiles only ever list posts that have already been doxxed.

The anonymity rule is enforced in one place, `src/posts.ts`. The author's username isn't even selected from the database until the post is doxxed.

## Run it locally

You need Node 22+ and Docker (or any Postgres 15+).

```bash
docker compose up -d          # starts Postgres on localhost:5432
cp .env.example .env          # then put a long random string in JWT_SECRET
npm install
npm run db:migrate
npm run dev                   # http://localhost:3000
```

Then start the [frontend](https://github.com/pandroidYT/doxxd-frontend).

## Tests

```bash
docker compose up -d
npm test
```

The tests create (and wipe) a separate `doxxd_test` database. Point `TEST_DATABASE_URL` elsewhere if needed.

## Deploy (free)

1. **Database:** create a free Postgres on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and copy its connection string.
2. **API:** on [Render](https://render.com), choose *New → Blueprint* and pick this repo (it reads `render.yaml`). Set:
   - `DATABASE_URL`: the connection string from step 1
   - `CORS_ORIGINS`: your frontend's URL, e.g. `https://doxxd.vercel.app`
   - `JWT_SECRET` is generated for you.

   `npm start` runs migrations automatically before starting the server.

## API

All bodies are JSON. Send `Authorization: Bearer <token>` for anything that needs a login.

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| POST | `/auth/register` | | `{username, email, password}` → `{token}` |
| POST | `/auth/login` | | `{login, password}` (username or email) → `{token}` |
| GET | `/me` | ✓ | Your account, dox tokens, stats, unread count |
| PATCH | `/me` | ✓ | `{bio?, avatarColor?}` |
| DELETE | `/me` | ✓ | `{password}`: deletes your account and everything in it |
| GET | `/me/posts` | ✓ | All your posts, anonymous or not (only you see this) |
| GET | `/posts?filter=all\|doxxed&cursor=` | optional | Feed (20 per page, `nextCursor` for more) |
| POST | `/posts` | ✓ | `{content, parentId?}`: post or reply (max 280 chars) |
| GET | `/posts/:id` | optional | A post with its parent and replies |
| DELETE | `/posts/:id` | ✓ | Delete your own post |
| POST / DELETE | `/posts/:id/like` | ✓ | Like / unlike |
| POST | `/posts/:id/dox` | ✓ | Spend a token to unmask the author |
| GET | `/users/:username` | optional | Public profile, their exposed posts, and posts they doxxed |
| GET | `/notifications` | ✓ | Replies to you and doxxes of you |
| POST | `/notifications/read` | ✓ | Mark all as read |
| GET | `/leaderboard` | | Most doxxed and top doxxers |

Errors look like `{ "error": "Human-readable message" }`.

## Changing the schema

Edit `src/db/schema.ts`, then:

```bash
npm run db:generate   # writes a new SQL file into drizzle/
npm run db:migrate
```
