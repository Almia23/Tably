# Tably — Build Progress Tracker

Tracks implementation of `project-plan.md` in phases. Updated after every phase with what shipped, what changed in the plan/architecture, and what's next.

**Stack decisions locked in:** Next.js (App Router, TS) · Prisma · SQLite locally → Postgres/Neon in prod · Pusher for real-time · NextAuth for auth · OpenAI (GPT-4o vision) for parsing. Deploy target: Vercel + Neon.

Local dev runs entirely on placeholder env vars until real API keys (OpenAI, Pusher, Neon) are supplied — see `.env.example`.

---

## Phase 0 — Project Scaffolding
**Status:** ✅ Done
- [x] Next.js app (App Router, TypeScript, Tailwind)
- [x] Prisma set up with SQLite (dev), schema ready to swap to Postgres
- [x] Folder structure (`app/`, `lib/`, `components/`, `prisma/`)
- [x] `.env.example` with all required keys documented
- [x] README with setup instructions

Verified: `npm run lint`, `npm run build`, and `npm run dev` (200 OK) all pass.
Initial migration `20260723090500_init` applied to local SQLite `dev.db`.

## Phase 1 — Core Parsing + Manual Split (Single-User)
**Status:** ✅ Done
- [x] Data model migration: User, Bill, BillItem, Claim, Settlement, AuditLog (+ Participant, see Phase 0 change log)
- [x] Receipt upload UI
- [x] OpenAI vision parsing API route (structured JSON output)
- [x] Manual entry fallback form (parsing failure / low confidence)
- [x] Single-user manual item tagging/claiming UI
- [x] Debt-simplification algorithm (deterministic, tested)
- [x] Settlement summary screen

Implementation notes:
- `/new` is a 4-step wizard (upload → review items → participants → tag claims) that
  submits once to `POST /api/bills`, which creates the Bill/Participants/Items/Claims
  and computes both Settlement views in a single transaction, then redirects to
  `/bill/[id]` for the read-only results/settlement summary.
- `parseReceiptImage` (`src/lib/receiptParser.ts`) returns `null` whenever no real
  `OPENAI_API_KEY` is configured or the API call/JSON parse fails — verified the UI
  falls through to manual entry cleanly in both cases (no dead-ends, per plan §6).
- `simplifyDebts` (`src/lib/debt.ts`) verified by hand-computed scenarios via `tsx`
  before wiring into the API.
- Duplicate participant names are explicitly rejected (400, surfaced inline in the
  UI) rather than silently misattributing claims — the plan calls this out as a
  correctness bug, not cosmetic (§9 Flow 2). Real name *disambiguation* (auto-tag
  suggestions) is deferred to Phase 2's live join flow, where it's actually needed
  since people join concurrently rather than being typed in by one admin.
- End-to-end verified manually: fallback parsing, bill creation, settlement math
  (simplified vs. individual, tax/tip split), and both validation error paths.

## Phase 2 — Real-Time Multi-User Claiming
**Status:** ✅ Done
- [x] Table Code generation + join-by-code flow
- [x] Guest identity (name + session token, no account required)
- [x] Pusher channel wiring for live claim sync (falls back to 5s polling if unconfigured)
- [x] Presence indicators (joined/saved status per participant)
- [x] Simultaneous-claim-on-same-item → auto-shared logic

This phase ended up absorbing most of what was originally scoped for Phase 4 —
see the Change Log entry below for why. Also shipped as part of this phase:
- [x] Homepage/Activity Feed (Ledger) — chronological log rendered on the Table page
- [x] Participant count field + edit + auto-finalize suggestion nudge
- [x] Manual "Close the Tab" with warning for unsaved participants
- [x] Reopen Tab action (logged in Ledger)
- [x] Copy Split Summary (clipboard, formatted text)
- [x] Audit log wired to every mutation (guest actor, verified via token)
- [x] Add Missed Item, Manual Correction (edit item), Who Paid (editable), Mark Settled

Implementation notes:
- Old Phase 1 routes/pages (`/api/bills`, `/bill/[id]`) were removed and replaced by
  `/api/tables/*` + `/table/[code]`, since Phase 1's "admin tags everyone" flow is
  fundamentally superseded once people can claim for themselves live. Phase 1's
  debt-simplification and parsing logic were carried over and reused.
- Guest identity is a `(participantId, guestToken)` pair persisted in `localStorage`
  per table code (`src/lib/guestIdentity.ts`) and checked server-side
  (`src/lib/verifyParticipant.ts`) on every mutation — not full session security,
  but enough to keep the audit log trustworthy without requiring login.
- End-to-end verified manually via curl: create table → second guest joins →
  concurrent claim on the same item auto-shares it → capacity limit blocks a 3rd
  joiner → both participants save → Close the Tab computes correct settlements →
  late joiner after close gets `{closed:true}` (redirects to results, not claim
  screen) → name collision auto-suffixes ("Raj" → "Raj (2)") → Reopen Tab clears
  and allows re-closing with fresh settlements.
- Real-time transport (Pusher) itself wasn't hand-tested against a live Pusher
  account (no real credentials yet, per your choice to add keys later) — but the
  polling fallback path was exercised, and `broadcast()`/`useTableChannel` no-op
  safely when `PUSHER_KEY` is a placeholder, so the app is fully usable today and
  will pick up real-time delivery automatically once real keys are added.

## Phase 3 — Auth, Accounts & History
**Status:** ✅ Done
- [x] NextAuth setup — credentials (email + password), not magic-link
- [x] Persistent pairwise balances across bills for logged-in users
- [x] Bill history page
- [x] Optional cosmetic group labels
- [x] Guest → account merge / signup nudge after Table closes

Implementation notes:
- Used NextAuth v5 (`next-auth@beta`) with a **Credentials provider + JWT
  sessions** instead of the plan's suggested magic-link email, since we don't
  have a real SMTP/email provider configured (per the "build locally with
  placeholders first" decision) — see Change Log. `passwordHash` added to
  `User` via a new migration (`add_password_hash`); `/api/auth/signup` +
  `/login` + `/signup` pages wrap NextAuth's `signIn("credentials", ...)`.
- Table creation (`POST /api/tables`) and joining (`POST /api/tables/[code]/join`)
  both now check for a session and, if present, set `Participant.userId`
  (still generating a `guestToken` too, even for logged-in users — see Change
  Log for why) so their identity is persistent across Tables from the moment
  they create/join one while logged in.
- `/history`: lists every Bill a user's Participant rows belong to (deduped by
  bill), server-rendered, requires login (redirects to `/login?callbackUrl=...`
  otherwise).
- `/balances`: aggregates all **unsettled** `SIMPLIFIED`-view Settlement rows
  where the user is either side, netted per counterparty. Counterparties with
  a linked account are grouped by their stable `userId` (accurate across every
  Table); counterparties who are still just guests are grouped by display name
  and flagged "(guest, approximate)" in the UI, since two different guests
  could reuse the same name on different Tables.
- Guest → account merge: `POST /api/tables/[code]/participants/[id]/merge`
  requires **both** a valid session and the original `guestToken` (proving
  it's really their guest identity) before attaching `userId` to that
  Participant row. Nudge UI on the closed Table page: if you're the identity
  in this browser and not yet linked, shows "sign up to track this
  automatically" (unauthenticated) or "link account" (already logged in as
  someone else in another tab). Verified end-to-end: created a table logged
  in (shows up correctly in `/history` and `/balances` right away), had a
  guest join/claim/save/close, signed the guest up afterward, called merge,
  and confirmed both sides of `/balances` now show the real linked name
  instead of "(guest, approximate)".
- Group labels (`Bill.groupLabel`, already in the schema since Phase 0) are now
  actually exposed as an optional input in the Table-creation wizard's final
  step and rendered on the `/history` list.
- Added a `NavBar` (client component, `useSession`) in the root layout showing
  Log in/Sign up or History/Balances/Log out depending on auth state.

## Phase 4 — Ledger, Close the Tab & Settlement UX
**Status:** ✅ Done — most of this shipped in Phase 2 (see above); the last
piece (low-confidence clarification messages) is now complete too:
- [x] Low-confidence clarification messages surfaced as a distinct, resolvable
      Ledger entry with inline fix/confirm

Implementation notes:
- `CLARIFICATION_RAISED` is logged (with the item name) for every item the
  parser flagged low-confidence, at Table-creation time.
- The Claim page's item card now has an inline **"Edit"** action (prompts for
  name/price/quantity, `PATCH`es the item — this was previously wired up
  API-side in Phase 2 but had no UI at all, so this also closes that gap) and,
  for still-unconfirmed low-confidence items specifically, a **"Looks right"**
  one-tap confirm action that clears the flag without changing any values.
- Either path (edit or one-tap confirm) logs `CLARIFICATION_RESOLVED`, and the
  Ledger renders both events in plain English (⚠️ raised / ✓ resolved).
- Verified end-to-end via curl: created a Table with one `lowConfidence: true`
  item → confirmed `CLARIFICATION_RAISED` appears in the Ledger → called the
  no-op-patch "confirm" path → confirmed `lowConfidence` flips to `false` and
  `CLARIFICATION_RESOLVED` appears right after it.

## Phase 5 — UX Risk Fixes & Polish
**Status:** ✅ Done
- [x] Name collision handling on join
- [x] Table-at-capacity messaging + bump-count path
- [x] Late joiner after close → results view, not claim screen
- [x] Edit-after-save allowed until Table closed
- [x] Sync status indicator + retry-once (not a full offline queue — see notes)
- [x] Mobile-first responsive pass across all screens
- [x] Loading/error states throughout

This phase worked through `project-plan.md` §9's UX Risk Audit item by item.
Most of Flow 1–3's risks (parsing loading/fallback state, headcount edit not
buried, capacity/collision/late-joiner handling, "nothing to claim",
edit-after-save) were already satisfied by Phases 1–2; this phase's actual new
work was:
- **Editable "who paid"** now has a UI (`Edit who paid` prompt on the Claim
  page, disabled once closed with a note to reopen first) — the API
  (`PATCH /api/tables/[code]/payer`) existed since Phase 2 but had no frontend
  control at all until now.
- **Prominent, persistent join link**: a "Copy join link" button next to the
  Table Code in the header (Flow 7 — guests losing the Table link).
- **Stale-headcount nudge**: a small inline note ("Only 3 of 5 expected have
  joined — share the code, or update the headcount") shown whenever the Table
  is open and under capacity (Flow 1's risk about the creator forgetting to
  keep the headcount current).
- **Close-time clarification warning**: closing when unresolved low-confidence
  items remain no longer just silently proceeds — it surfaces a warning
  listing which items, while still never hard-blocking finalize (Flow 4's
  explicit recommendation).
- **Richer correction history in the Ledger**: `ITEM_EDITED` entries now show
  the actual before → after diff (e.g. `price: 12 → 15`) instead of just
  "corrected an item," so conflicting edits are visible, not just their final
  value (Flow 4's CRDT-adjacent conflict-visibility ask).
- **Sync status indicator + one retry**: every claim/save/add-item action now
  shows "Saving…" → "✓ Synced" or a persistent "⚠️ Couldn't sync" if both the
  original attempt and one retry fail — addressing Flow 8's "never let an
  action look saved when it never synced" without building a full offline
  queue (see Change Log for why that's an explicit, documented scope cut).
- Confirmed (by re-reading, not new code) that the existing Tailwind layout —
  single-column `flex flex-col` sections, no fixed-width grids, `max-w-2xl`
  containers — already renders correctly at phone widths; no dedicated mobile
  CSS was needed beyond what Phases 0–4 already used by default.

## Phase 6 — Deploy to Vercel + Neon
**Status:** ✅ Codebase deployment-ready; actual live deployment is a manual
step for you to run (see below for why).
- [x] Prisma datasource documented + ready to swap SQLite → Postgres (Neon) —
      a two-line change, no model changes needed
- [x] `postinstall` script added (`prisma generate`) so Vercel's build
      pipeline generates the Prisma client automatically
- [x] Production env vars fully documented (`.env.example` + README)
- [x] Local production build (`npm run build`) verified clean
- [x] Full step-by-step deploy + smoke-test instructions written in README.md
- [ ] Actual live Vercel deployment — **not performed in this session**, since
      it requires your own Neon database and Vercel account/credentials,
      which weren't provided (per your choice to prepare everything and
      deploy yourself rather than share those credentials with me)

Implementation notes:
- `prisma/schema.prisma`'s datasource block now has an expanded comment
  covering the exact Postgres swap, including the `directUrl` addition Neon's
  pooled-connection setup needs for Prisma Migrate to work.
- `.env.example` documents `DIRECT_URL` alongside `DATABASE_URL` for the
  Postgres case, and clarifies `NEXTAUTH_URL` should be the real deployed URL
  in production.
- README's new **Deployment (Vercel + Neon)** section is a complete, ordered
  runbook: create Neon DB → swap schema provider → run one Postgres migration
  → push to GitHub → import into Vercel → set env vars → deploy → smoke test
  (create a Table in two windows, confirm live sync, sign up, close a Tab,
  check history/balances).
- No code changes were made to the SQLite datasource itself (it's still what
  local dev uses) — only documentation/config for the swap, since actually
  switching would break local development in this sandbox, which has no
  Postgres available.

## Overall Status: All 7 phases (0–6) are code-complete and verified locally
(lint, build, and extensive end-to-end curl smoke tests across every
flow — parsing/fallback, table creation, joining, claiming, auto-sharing,
capacity limits, close/reopen, auth/signup/login, history, balances, guest
merge, clarification messages, payer edits, sync-status). The only remaining
step is the live Vercel/Neon deployment itself, which needs your credentials
and is documented above.

---

## Change Log
_Notes on any deviations from the original `project-plan.md` made during implementation, and why._

- **Prisma pinned to v6** instead of latest v7. Prisma 7 removed the classic `url = env(...)` datasource config in favor of a driver-adapter-only architecture, which adds real complexity (custom adapters, `prisma.config.ts`) with no benefit for this project's scope. v6 is stable, standard, and has first-party Neon/Vercel docs — better fit for a thesis-timeline project.
- **Added a `Participant` model** not explicitly named in the plan's §4 data model. The plan's `BillItem`/`Claim`/`AuditLog` all reference "actor" as either a user_id or guest_token via comments — `Participant` makes that concrete: one row per person-per-bill (logged-in or guest) that everything else (`Claim`, `Settlement`, `AuditLog`, `BillItem.addedBy`) references uniformly. This directly supports the plan's own disambiguation requirement (§9, Flow 2: "Raj" vs "Raj (2)") via a `displayName` field, and keeps the guest/user duality from leaking into every other table.
- **Phase 1 bills are created and closed in one API call** rather than staying `OPEN` for a claiming period — appropriate since Phase 1 is explicitly single-user/no-real-time (plan §7). `status: OPEN` and the join/claim window become meaningful starting Phase 2.
- **Duplicate participant names are rejected outright** in Phase 1 (400 + inline UI error) instead of auto-suffixing them. Auto-generated disambiguation (e.g. "Raj (2)") would silently reassign a real person's claims to the wrong participant if the admin picks the wrong one from a dropdown — worse than asking them to type a distinguishing name up front. Proper collision-handling UX (per plan §9 Flow 2) is deferred to Phase 2, where it's actually needed for concurrent self-joins.
- **Phase 1's admin-tags-everyone flow was fully replaced, not layered on top, once Phase 2 landed.** `/api/bills` and `/bill/[id]` are gone; `/api/tables/*` + `/table/[code]` are the one true bill-creation/claiming/results flow going forward. Keeping two parallel paths (one where an admin tags for everyone, one where people tap for themselves) would have been confusing and against the plan's own thesis (live self-claiming *is* the differentiator vs. Splitwise) — the parsing pipeline and debt algorithm validated in Phase 1 were carried over as-is.
- **Phase 2 absorbed most of planned Phase 4 scope** (Ledger, Close the Tab, Reopen, participant count editing, audit log, copy summary, mark-settled). Building live claiming without a way to view the running activity feed or ever close/settle the bill would have been a non-demoable, incomplete slice — so those pieces were built together as one coherent Table experience. Phase 4 is now scoped down to just the low-confidence clarification-message thread that's still missing.
- **Name collision handling differs by phase, intentionally.** Phase 1 (admin bulk entry) rejects duplicates outright; Phase 2 (self-service join) auto-suffixes ("Raj" → "Raj (2)") since there's no admin to ask for a distinguishing name — matching the plan's own suggested resolution in §9 Flow 2.
- **Pusher real-time delivery is implemented but not hand-verified against a live Pusher account** (per your choice to add real API keys later). `broadcast()`/`useTableChannel` both no-op safely on placeholder credentials, and the client polls every 5s as a fallback in that case — so the app is fully functional today and will get instant sync automatically once real Pusher keys are added, with nothing left to change in code.
- **Auth uses email + password (Credentials provider), not magic-link email**, contrary to the plan's suggested "email/magic link". A real magic-link flow needs a working SMTP/email provider, which we don't have configured (same "placeholders first" tradeoff as OpenAI/Pusher) — password auth works fully offline right now. Swapping in an `Email` provider alongside (or instead of) Credentials later is a small, additive change to `src/lib/auth.ts`, not a rewrite.
- **Logged-in participants still get a `guestToken`.** Rather than rearchitecting every `/api/tables/[code]/*` mutation to branch between session-based and token-based auth, logged-in users get both `userId` (for persistent identity/history/balances) *and* a `guestToken` (for the existing lightweight bearer-token mutation check `verifyParticipant()` already does). This keeps one uniform, already-tested auth path for every mutation regardless of login state — the tradeoff is that this token model still isn't "real" session security (documented already in Phase 2's notes), just consistently applied.
- **Pairwise balances only count `SIMPLIFIED`-view, unsettled Settlement rows.** Once a settlement is marked paid it should stop counting toward the running balance; `INDIVIDUAL` view is intentionally excluded since (per the Phase 1/2 note) it's currently mathematically identical to `SIMPLIFIED` for every single-payer bill in the app today, so including both would double-count.
- **Found during the Phase 3→4 review: Manual Correction (`PATCH /api/tables/[code]/items/[itemId]`) had no frontend UI at all** despite being fully implemented API-side back in Phase 2 — the Claim page only ever called it implicitly via the plan for low-confidence items but never actually rendered an edit control. Fixed as part of Phase 4's clarification-message work, since a "confirm/fix" affordance was needed there anyway; also added a general "Edit" action on every item, not just low-confidence ones, so this feature is now actually reachable from the UI.
- **Connectivity handling (plan §9 Flow 8) is a retry-once + visible sync-status indicator, not a full offline queue.** A true offline queue (persist pending actions locally, replay them on reconnect, resolve conflicts against server state that moved on) is a meaningfully bigger feature — arguably its own phase — for marginal benefit at this MVP's scope, where a claim/save/edit is a small, cheap, idempotent-ish POST that's safe to just retry immediately. The current behavior (retry once, then show a persistent "⚠️ Couldn't sync" until the next successful action) satisfies the plan's actual stated concern ("never let an action look saved when it never synced") without the added complexity — flagged as an explicit scope cut, not an oversight, worth a paragraph in the thesis's future-work section.
- **Similarly, Manual Correction's "Edit" also found during Phase 4→5 review: editable "who paid" had an API since Phase 2 but no UI until Phase 5** — same pattern as the item-edit gap, now fixed with a lightweight prompt-based control consistent with the rest of the app's MVP-level interaction style (headcount edit uses the same `prompt()` pattern).
