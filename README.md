# DoXXd API

The backend for **DoXXd**: a social feed where every post is anonymous, until someone spends a dox token to unmask its author.

**Stack:** Node 22 · TypeScript · [Hono](https://hono.dev) · [PGlite](https://pglite.dev) (Postgres that runs inside Node) · [Drizzle ORM](https://orm.drizzle.team) · Zod · Vitest

This server also serves the [website](https://github.com/pandroidYT/doxxd-frontend), so the whole thing is one program on one port, with no database to install.

## How the game works

- Every post gets a random alias (e.g. `Masked Otter #0421`). The author's account is never sent to anyone else.
- Everyone has **3 dox tokens**, topped back up every day at midnight UTC.
- Spending a token on a post (`POST /posts/:id/dox`) unmasks its author **for everyone**, permanently. The doxxer is credited publicly too.
- You can't dox yourself or a post someone else already doxxed. Failed attempts don't cost a token.
- Getting doxxed earns you a **revenge token** (bonus tokens are kept through refills, up to 10).
- Public profiles only ever list posts that have already been doxxed.

The anonymity rule is enforced in one place, `src/posts.ts`. The author's username isn't even selected from the database until the post is doxxed.

## Run it

You only need [Node.js 22+](https://nodejs.org) and [Git](https://git-scm.com). Put both repos in the same folder:

```bash
git clone -b claude/friends-website-project-mmmg5p https://github.com/pandroidYT/doxxd-backend
git clone -b claude/friends-website-project-mmmg5p https://github.com/pandroidYT/doxxd-frontend
cd doxxd-backend
npm run setup     # first time, and again after pulling new code
npm start
```

Then open **http://localhost:3000**. It also prints a network address that other devices on the same Wi-Fi can use.

- Accounts and posts are saved in `data/`. Delete that folder to start over.
- Settings (port, folders) are optional. See `.env.example`.
- To work on the code with live reload, run `npm run dev` here and `npm run dev` in `doxxd-frontend`, then open http://localhost:5173.

## Tests

```bash
npm test
```

Each test file gets its own in-memory database, so nothing to set up.

## API

Every path below is under `/api` (e.g. `/api/posts`). All bodies are JSON. Send `Authorization: Bearer <token>` for anything that needs a login.

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
```

The new migration is applied automatically the next time the server starts.

