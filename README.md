# Tably

An LLM-powered, real-time bill-splitting app. See [`project-plan.md`](./project-plan.md)
for the full product/technical spec and [`PROGRESS.md`](./PROGRESS.md) for build status.

## Stack

- **Framework:** Next.js (App Router, TypeScript, Tailwind, shadcn/ui)
- **Database:** Prisma ORM — Postgres (Neon), including in local dev
- **Real-time:** Pusher (falls back to 5-second polling if unconfigured)
- **Auth:** NextAuth.js (credentials + guest identities)
- **LLM:** OpenAI (vision-capable model) for receipt parsing

## Getting Started

```bash
npm install
cp .env.example .env   # fill in real values — see below
npx prisma migrate dev # applies schema against DATABASE_URL
npm run dev
```

App runs at http://localhost:3000.

### Environment variables

See `.env.example` for the full list, and `AUTH_SECRET`/Pusher setup below for how
to get real values. The app degrades gracefully without some of these, but not others:

- **`DATABASE_URL` / `DIRECT_URL`** — **required**, the app won't start without a
  working Postgres connection (see Database section below).
- **`AUTH_SECRET`** — **required for login/signup to work at all**. Without it,
  NextAuth throws `MissingSecret` at request time (this is the most common
  "auth doesn't work in production" bug — see the callout below).
- **`OPENAI_API_KEY`** — needed for receipt parsing (Phase 1). Without it, the
  app degrades to manual item entry.
- **Pusher vars** (`PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`,
  `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`) —
  needed for instant live sync between devices. Without them, the app silently
  falls back to polling every 5 seconds — still works, just not instant.

#### `AUTH_SECRET` — the #1 cause of broken login in production

If Vercel logs show `[auth][error] MissingSecret: Please define a secret`,
`AUTH_SECRET` isn't set (or isn't set for the right environment) in your
deployment:

1. Generate one locally: `npx auth secret` (or `openssl rand -base64 32`).
2. In Vercel → Project → Settings → Environment Variables, add `AUTH_SECRET`
   with that value for **Production** (and **Preview**, if you use preview
   deployments — each environment needs its own env vars set explicitly).
3. Redeploy (env var changes don't apply to already-running deployments).

#### Setting up Pusher (real-time claim sync)

Pusher is what makes item claims appear instantly on everyone else's screen
instead of waiting up to 5 seconds for the next poll. To wire it up:

1. Sign up at [pusher.com](https://pusher.com) (free tier is plenty for this app).
2. Create a new **Channels** app (not Beams/Chatkit) — pick any name/cluster
   region close to your users.
3. Open the app's **App Keys** tab. You'll see four values: `app_id`, `key`,
   `secret`, `cluster`.
4. Map them into your env vars:
   - `PUSHER_APP_ID` = `app_id`
   - `PUSHER_KEY` = `key`
   - `PUSHER_SECRET` = `secret`
   - `PUSHER_CLUSTER` = `cluster` (e.g. `us2`, `ap2`)
   - `NEXT_PUBLIC_PUSHER_KEY` = same value as `PUSHER_KEY` (the client needs
     this to subscribe to channels — it's public by design, unlike the secret)
   - `NEXT_PUBLIC_PUSHER_CLUSTER` = same value as `PUSHER_CLUSTER`
5. Set all six locally in `.env`, and in Vercel's env vars for Production
   (and Preview) if deploying.
6. Restart `npm run dev` (or redeploy) — `src/lib/pusher.ts` /
   `src/lib/pusherClient.ts` detect these automatically via
   `isRealtimeConfigured()`; no code changes needed.
7. Verify it worked: open a Table in two browser windows, claim an item in
   one, and confirm it appears in the other without a manual refresh.

### Database

The app runs on Postgres (Neon) everywhere, including local dev — there's no
SQLite fallback anymore. To set up a database:

1. Create a Neon project at [neon.tech](https://neon.tech) and open its
   "Connect" panel.
2. Copy the **pooled** connection string (has `-pooler` in the hostname) into
   `DATABASE_URL`, and the **direct** connection string into `DIRECT_URL`
   (Prisma Migrate needs a direct connection; the running app uses pooled).
3. Run `npx prisma migrate dev` to apply the schema.

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

1. **Create a Neon Postgres database** (see Database section above) if you
   haven't already, and note `DATABASE_URL`/`DIRECT_URL`.

2. **Push the repo to GitHub** (Vercel deploys from a git provider).

3. **Import the project into Vercel** (vercel.com → Add New → Project → import
   the repo). Vercel auto-detects Next.js; no custom build command is needed
   (`postinstall` already runs `prisma generate` for you — see `package.json`).

4. **Set environment variables** in the Vercel project settings for
   **Production and Preview both** (each environment needs its own values —
   a var set only under Production won't apply to preview deployments):
   - `DATABASE_URL`, `DIRECT_URL` — from step 1
   - `AUTH_SECRET` — a real secret (`npx auth secret`), **required** — see the
     `MissingSecret` callout above if login breaks after deploying
   - `NEXTAUTH_URL` — your Vercel deployment URL (e.g. `https://tably.vercel.app`)
   - `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` — a real OpenAI key for receipt
     parsing to work (the app degrades gracefully to manual entry without one,
     but that defeats the point of a live demo)
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`,
     `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` — see the Pusher
     setup steps above; without these, real-time sync silently falls back to
     5-second polling instead of instant updates

5. **Deploy.** Vercel will run `npm install` (triggering `prisma generate` via
   `postinstall`) then `npm run build`.

6. **Smoke test the live URL**: create a Table, open it in a second
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
