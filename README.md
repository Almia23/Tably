# Tably

An LLM-powered, real-time bill-splitting app. See [`project-plan.md`](./project-plan.md)
for the full product/technical spec and [`PROGRESS.md`](./PROGRESS.md) for build status.

## Stack

- **Framework:** Next.js (App Router, TypeScript, Tailwind)
- **Database:** Prisma ORM — SQLite locally, Postgres (Neon) in production
- **Real-time:** Pusher
- **Auth:** NextAuth.js
- **LLM:** OpenAI (vision-capable model) for receipt parsing

## Getting Started

```bash
npm install
cp .env.example .env   # already done for local dev; fill in real keys before deploying
npx prisma migrate dev # applies schema, creates local dev.db
npm run dev
```

App runs at http://localhost:3000.

### Environment variables

See `.env.example` for the full list. Locally, everything works with placeholder
values except features that call external services directly:

- **Receipt parsing** needs a real `OPENAI_API_KEY` (Phase 1).
- **Live claim sync** needs real Pusher credentials (Phase 2).
- **Login** needs a real `AUTH_SECRET` before deploying (Phase 3+).

### Database

Local dev uses SQLite (`prisma/dev.db`, gitignored). To move to Neon Postgres for
deployment:

1. Create a Neon project and copy its connection string.
2. Set `DATABASE_URL` to the Neon connection string (locally or in Vercel env vars).
3. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`.
4. Run `npx prisma migrate dev` (or `migrate deploy` in CI/CD) against the new URL.

## Project Structure

```
prisma/schema.prisma   Data model (see project-plan.md §4 for the conceptual model)
src/app/               Next.js App Router pages & API routes
src/lib/               Shared server-side utilities (Prisma client, auth, LLM, debt algo)
src/components/        React components
```

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — lint

## Deployment (Vercel + Neon)

1. **Create a Neon Postgres database.**
   - Sign up at neon.tech, create a project, and open its "Connect" panel.
   - Copy the **pooled** connection string (the one with `-pooler` in the
     hostname) — this becomes `DATABASE_URL`.
   - Copy the **direct** (unpooled) connection string too — this becomes
     `DIRECT_URL`. Prisma Migrate needs a direct connection; the running app
     uses the pooled one.

2. **Switch the schema to Postgres.**
   - In `prisma/schema.prisma`, change the `datasource db` block:
     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")
       directUrl = env("DIRECT_URL")
     }
     ```
   - With `DATABASE_URL`/`DIRECT_URL` pointed at Neon in your local `.env`,
     run a fresh migration against Postgres:
     ```bash
     npx prisma migrate dev --name init_postgres
     ```
     (No schema *model* changes are needed beyond the datasource block — every
     model was written to avoid SQLite-only features specifically so this
     swap is mechanical. The old SQLite migration history in
     `prisma/migrations/` stays as a record of local dev history; Postgres
     gets its own migration run from here.)

3. **Push the repo to GitHub** (Vercel deploys from a git provider).

4. **Import the project into Vercel** (vercel.com → Add New → Project → import
   the repo). Vercel auto-detects Next.js; no custom build command is needed
   (`postinstall` already runs `prisma generate` for you — see `package.json`).

5. **Set environment variables** in the Vercel project settings (Production —
   and Preview, if you want preview deployments to work too):
   - `DATABASE_URL`, `DIRECT_URL` — from step 1
   - `AUTH_SECRET` — a real secret (`npx auth secret`), **not** the local dev
     placeholder
   - `NEXTAUTH_URL` — your Vercel deployment URL (e.g. `https://tably.vercel.app`)
   - `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` — a real OpenAI key for receipt
     parsing to work (the app degrades gracefully to manual entry without one,
     but that defeats the point of a live demo)
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`,
     `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` — from a free
     Pusher Channels app (pusher.com); without these, real-time sync silently
     falls back to 5-second polling instead of instant updates, which still
     works but isn't the intended demo experience

6. **Deploy.** Vercel will run `npm install` (triggering `prisma generate` via
   `postinstall`) then `npm run build`.

7. **Smoke test the live URL**: create a Table, open it in a second
   browser/incognito window, join, claim an item, and confirm the update
   appears on the first window without a manual refresh (that's Pusher
   working) — then sign up, close a Tab, and check `/history` and `/balances`.

## Build Phases

This project is built incrementally. Track progress in [`PROGRESS.md`](./PROGRESS.md):

1. Scaffolding
2. Core parsing + manual split
3. Real-time multi-user claiming
4. Auth, accounts & history
5. Ledger, Close the Tab & settlement UX
6. UX risk fixes & polish
7. Deploy to Vercel + Neon
