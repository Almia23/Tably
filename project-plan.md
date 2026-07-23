# Tably — Project Plan
### An LLM-Powered, Real-Time Bill Splitting App

**Theme:** Restaurant/dining metaphor throughout, instead of generic tech terms:
- A bill session = a **Table** (join via a **Table Code**)
- The claiming screen = **Your Order**
- The shared activity feed/audit log = **Ledger** (referred to as "the Ledger" in-app)
- Finalizing a split = **Close the Tab**

---

## 1. Project Overview

**Problem:** Splitting a bill among friends currently requires either (a) manually typing every item into an app like Splitwise, or (b) uploading a receipt photo to an LLM and manually tagging who ate what — both of which rely on one "admin" person doing tedious work after the fact.

**Solution:** A web app where a receipt photo is parsed automatically by an LLM into itemized data, and everyone at the table claims their own items simultaneously in a live session on their own phone — removing the single-admin bottleneck entirely. Debts are calculated and simplified automatically.

**Core differentiators vs. Splitwise:**
1. LLM-based receipt parsing (Splitwise requires manual entry)
2. Real-time, multi-user simultaneous claiming (Splitwise is single-user, sequential tagging)

---

## 2. MVP Feature Set (Build This First)

| # | Feature | Description |
|---|---|---|
| 1 | **Receipt Upload & Parsing** | User photographs/uploads a receipt. OpenAI's vision-capable model (e.g. GPT-4o) extracts items, quantities, prices, tax, and tip into structured JSON. |
| 2 | **Session Creation** | A "bill session" is created from the parsed receipt. A shareable link/code is generated. |
| 3 | **Live Join** | Friends open the link and join the session with a name (no full account needed for guests, but registered users get history). |
| 4 | **Real-Time Claiming** | Each item is shown as a tappable card. Users tap items they had. Shared items get a simple "split between N people" toggle. Claims sync live across all devices (via Pusher/Ably). |
| 5 | **Manual Correction** | If the LLM misparses an item (wrong price, merged items, etc.), any user can edit it before/during claiming. |
| 6 | **Debt Calculation** | Once claiming is finalized, compute who owes whom using a debt-simplification algorithm (minimize number of transactions). |
| 7 | **Who Paid** | Bill creator marks who actually paid the restaurant. All debts are calculated relative to this payer (plus any secondary settlements if it wasn't a single payer). |
| 8 | **Tax Split** | Tax is split evenly across all participants by default (configurable to proportional-to-order later). Tip can follow the same rule. |
| 9 | **Settlement Summary** | Clear final screen: "You owe Priya ₹340", with a mark-as-settled button. |
| 10 | **Debt View Toggle — "Smart Settle"** | Toggle between: (a) **Simplified** — debts collapsed to the minimum number of transactions across the group (classic debt-simplification graph algorithm), or (b) **Individual** — everyone sees exactly what they owe/are owed by each specific person, unsimplified. Useful because simplified debts are more efficient to settle, but individual debts feel more transparent/"fair" to some people. |
| 11 | **Table Code Join** | Each bill session gets a short shareable code/link (e.g., `splitsmart.app/join/7K2N`) — friends open it, enter their name, and land straight in the live claiming screen. No pre-existing group needed. |
| 12 | **Basic Auth & History** | Simple email/password or magic-link auth. Logged-in users get persistent running balances with other known users across bills (see Section 9 below). Guests can fully participate without an account. |
| 13 | **Add Missed Item** | Any participant can manually add an item the LLM missed or that wasn't on the receipt (e.g., a cash-only add-on), which then becomes claimable like any other item. |
| 14 | **Homepage / Activity Feed** | A second page per bill, separate from the claiming screen — a chronological, chat-style log of the session: "Priya joined", "Rahul saved his claims", low-confidence parsing flags posted as a single clarification message, and finally "Final split generated" with the full claimed-item breakdown and settlement summary. |
| 15 | **Copy Split Summary** | One-tap "copy" button on the homepage to copy the final split (or raw parsed bill) as formatted text, for pasting into WhatsApp/any chat app. |
| 16 | **Participant Count** | Required at Table creation — the creator must set an expected number of people. Editable afterward (e.g., someone extra shows up, or someone drops). Reducing it below the number already joined is blocked; increasing it reopens joining if the Table had hit capacity. |
| 17 | **Close the Tab (Finalize)** | *Suggested* automatically once joined-count matches expected count and everyone has saved their order — but never auto-locks silently. A manual "Close the Tab" override is always available, with a warning listing anyone who hasn't saved yet. |
| 18 | **Audit Log** | Every edit, added item, and correction is logged against whatever identity performed it (logged-in user ID, or guest name + session token) and shown in the Ledger. No login is required to make changes — the log just always records who (or which guest) did what. |

---

## 3. Where the LLM Is Used (and Why)

This is the technical core of the project and the strongest thesis contribution.

| Feature | Traditional Approach | Why LLM Is Better Here |
|---|---|---|
| Receipt parsing | Rule-based OCR (e.g., Tesseract) with regex for prices | Traditional OCR breaks on variable receipt layouts, faded thermal print, handwritten additions, multi-language menus. LLM vision handles layout variance and can reason about ambiguous line items. |
| Ambiguous/shared item resolution | Would need hardcoded rules ("split evenly if unclaimed") | LLM can reason contextually — e.g., recognize "Family Platter" is typically shared. Low-confidence fields are posted as a single clarification message on the homepage/activity feed rather than blocking the claim screen. |
| Natural language claiming (stretch feature) | Not really possible without NLU | LLM can parse "I had the pasta and half the wine" into structured claims |

**Explicitly NOT using LLM for:**
- Debt simplification (deterministic graph/greedy algorithm — using an LLM here would be a poor design choice and worth noting as a considered rejection in the thesis)
- Auth, session management, real-time sync (standard engineering)

---

## 4. Technical Architecture

**Stack**
- **Frontend + Backend:** Next.js (App Router), deployed on Vercel
- **Real-time sync:** Pusher or Ably (serverless-compatible; raw WebSockets don't work well on Vercel's serverless functions)
- **Database:** Postgres via Neon or Supabase (serverless connection pooling)
- **LLM:** OpenAI API (GPT-4o or similar vision-capable model — parsing + claim resolution)
- **Auth:** Auth.js (NextAuth) or Supabase Auth

**High-level flow**
```
[User uploads photo] 
      → [Next.js API route sends image to OpenAI API]
      → [OpenAI returns structured JSON: items, prices, tax, tip]
      → [Session created in Postgres, session ID returned]
      → [Shareable link generated]
      → [Users join session, connect to Pusher channel]
      → [Claims broadcast in real time to all connected clients]
      → [On finalize: debt-simplification algorithm runs]
      → [Settlement summary shown + stored]
```

**Core data model**

```
User        (id, name, email, auth_provider)
Group       (id, name, created_by)
GroupMember (group_id, user_id)
Bill        (id, group_label, image_url, raw_llm_output, tax_amount, tip_amount, 
             paid_by_user_id, expected_participants, status, created_by, 
             table_code, created_at)
BillItem    (id, bill_id, name, price, quantity, added_by_actor)   // actor = user_id or guest_token
Claim       (id, item_id, user_id_or_guest_token, share_fraction)   // e.g. 0.5 for a 50/50 split
Settlement  (id, bill_id, from_user, to_user, amount, settled_boolean, 
             view_mode)   // 'simplified' or 'individual' — which toggle state generated this
AuditLog    (id, bill_id, actor_id_or_guest_token, action_type, target_id, 
             timestamp, details)   // powers "Ledger" feed
```

---

## 5. Persistence Model: Identity-Centric, Not Group-Centric

Unlike Splitwise, this app does **not** require pre-created, fixed groups — real friend groups reshuffle too often for that to be low-friction. Instead:

- **Users and pairwise balances are persisted; rigid "groups" are not required.**
- Every bill session is standalone and works with zero setup: upload → table code → people join by name → claim → settle.
- If a participant is logged in, their claims attach to their identity, so their balance with each other known person accumulates automatically across bills over time — without anyone having had to "create a group" in advance.
- **Guests** (no account) participate fully within a session, identified by name + session token. Their claims aren't tied to a persistent identity unless they later sign up and (optionally) merge matching guest history.
- A "group" becomes an optional cosmetic label/filter on a bill (e.g., "Roommates", "Goa Trip") for organizing history — not a structural requirement.

**What's persisted about a (logged-in) user:**
- Identity: name, email/phone, auth provider
- Bill history: which bills they were part of, what they claimed
- Pairwise running balance with other known users (derived, not manually maintained)
- Settlement records: who paid whom, when

**What's persisted about a guest:**
- Name + session token, scoped to that bill only, unless later merged into a real account

**Receipt image retention:**
- The raw receipt image is deleted once the final split is generated. The parsed contents (items, prices, tax, claims, final split) are retained as a permanent textual record on the homepage/activity feed instead — so nothing is lost, but no image (which may contain card details, addresses, etc.) is kept around indefinitely. Worth a short paragraph in the thesis on data minimization/privacy.

---

## 5.5 Two-Page Session Architecture

Each bill session is split across two distinct views, separating the "acting" experience from the "observing" experience:

**1. Claim Page** (per-user, private-feeling)
- Where a participant taps/claims their items and hits "save"
- Focused, low-noise, single-purpose UI — this is the "game loop" screen

**2. Homepage / Activity Feed** (shared, chat-style)
- A running, chronological log visible to everyone in the session: joins, "X has saved their claims," low-confidence parsing flags surfaced as a single clarification message (with an inline fix/confirm option), and finally "Final split generated"
- Once finalized, displays the comprehensive breakdown: who claimed what, and the final settlement amounts
- Includes the **copy-to-clipboard** button for pasting the split summary or raw parsed bill into any external chat
- Serves as the **textual record of the receipt** after the image itself is deleted (see Section 6 below) — so nothing is lost, but no image needs to be retained

This split is a deliberate UX decision worth documenting in the thesis: the claiming screen stays minimal and fast (game loop), while the homepage carries all the shared/social state (transparency, records, coordination).
## 6. Non-Functional Requirements

- **Latency:** Claim actions should sync across devices in under ~500ms to preserve the "live" feel.
- **Parsing reliability:** Target >90% accuracy on item/price extraction across a test set of real receipts (good material for the thesis evaluation chapter).
- **Mobile-first UI:** This will be used almost exclusively on phones at a table.
- **Graceful fallback:** If parsing fails or confidence is low, fall back to a manual entry form — never block the user.
- **Guest access:** Friends shouldn't need to create a full account just to claim items in one session.

---

## 7. Suggested Build Phases

**Phase 1 — Core parsing + manual split (no real-time yet)**
Upload → parse → single-user manual tagging → debt calculation. Validates the LLM parsing pipeline in isolation.

**Phase 2 — Real-time multi-user claiming**
Add session joining, live claim sync, presence indicators.

**Phase 3 — Polish + auth + history**
Add accounts, group history, running balances, settlement tracking.

**Phase 4 — Stretch features** (see below)

This phasing also maps cleanly onto thesis chapters (design → implementation → evaluation) if you build and document it in this order.

---

## 8. Stretch / Future Features

Roughly ordered by effort vs. payoff — good candidates for a "Future Work" thesis section even if not built:

| Feature | Description |
|---|---|
| Natural language claiming | Voice or text input parsed by LLM into claims |
| AI-suggested splits | LLM predicts likely splits based on a group's historical claiming patterns |
| Multi-currency support | Useful for travel groups; LLM can help normalize currency from receipt |
| Payment integration | UPI/PayPal deep links for one-tap settling |
| Receipt anomaly detection | Flag likely overcharges or bill errors (e.g., duplicate items) |
| Group spending insights | Simple stats: most expensive habits, spending trends over time |
| Light gamification | Optional, minimal — e.g., a "settled fast" streak — kept out of MVP per your direction |

---

## 9. User Flow Walkthrough & UX Risk Audit

Walking through every flow end-to-end to catch places where the experience could break down.

### Flow 1: Creating a Table
- Creator uploads a photo → **parsing takes a few seconds**. Needs a clear loading state; if it times out or fails, fall back to a manual item-entry form rather than dead-ending the user.
- **Participant count is now required.** Risk: at a restaurant, the creator often doesn't know the exact final number yet (people still arriving, someone might leave early). Since it's editable, the UI should make "edit later" obviously easy — not buried in a settings menu — otherwise this becomes a point of friction right at the start.
- Risk: creator picks a number and forgets to update it later, causing the "everyone's in" auto-finalize suggestion to never trigger, or to trigger with the wrong headcount. Consider a lightweight in-Ledger nudge like "Only 4 of 6 expected have joined — update count?" if there's a long gap with no new joiners.

### Flow 2: Joining a Table
- **Name collisions** — two people join and both type "Raj." Needs disambiguation (e.g., last-initial prompt, or auto-appended distinguishing tag) or claims/debts will get misattributed, which is a serious correctness bug, not just a cosmetic one.
- **Table at capacity** — clear message, plus a visible path for an existing participant (any of them, per your no-permissioning stance) to bump the count rather than a dead end.
- **Late joiners after Close the Tab** — should land on the final results view, not the claim screen, with a clear "this Table is closed" state rather than a confusing empty claim screen.

### Flow 3: Your Order (Claiming)
- **Simultaneous claims on the same item** — **Decision: silently allow both, auto-converts to shared.** If a second person claims an item someone else already has, it just becomes a shared item split between both claimants (rather than blocking or prompting). Simple, avoids interrupting the claiming flow, and matches real dining behavior (two people often did split that appetizer). Worth surfacing in the Ledger ("Item X is now shared between A and B") so it's not invisible.
- **People with nothing to claim** (e.g., only had water) — need an explicit "Nothing to claim" action so they register as "done," otherwise they'll silently block the auto-finalize suggestion forever since the app can't distinguish "hasn't started" from "has nothing to add."
- **Editing after save** — if claims lock immediately on save, someone who taps the wrong item has no recourse. Should allow re-editing until the Table is closed, with the audit log capturing changes rather than blocking them.

### Flow 4: The Ledger (activity feed / clarifications)
- **Conflicting edits** — since anyone can fix a low-confidence item, two people could "fix" the same field differently around the same time. Last-write-wins is simplest for MVP, but the Ledger should visibly show the correction history (not just the final value) so it's obvious what changed and by whom — this is also good thesis material (a lightweight CRDT-adjacent conflict question, worth discussing even if you pick the simple solution).
- **Clarification messages nobody addresses** — if a low-confidence flag sits unresolved, it could block finalize indefinitely. Worth deciding: does an unresolved flag block "Close the Tab," or just get accepted at best-guess if closed anyway? Recommend the latter (never hard-block), with a clear warning at close time.

### Flow 5: Close the Tab (Finalize)
- **Premature closing** — already addressed with the warning-before-override, but worth also showing *why* it's suggesting closure ("6/6 joined, 6/6 saved") so it doesn't feel like a black box.
- **Reopening after close** — mistakes will be found after the fact (someone realizes they forgot an item). Recommend allowing a "Reopen Tab" action rather than forcing a whole new Table, with the reopen itself logged in the Ledger for auditability.

### Flow 6: Settlement
- **Wrong payer marked** — needs to be editable after the fact, not locked in permanently, since this will happen.
- **Debt view toggle (simplified vs. individual)** — should probably be a personal display preference, not something that changes the underlying data, so different people can view it differently without conflict.
- **Unilateral "mark as settled"** — **Decision: one-sided for MVP.** The payer/recipient marks it settled unilaterally, no confirmation step. Simpler and lower-friction; worth noting in the thesis as a deliberate scope tradeoff (trust vs. friction) rather than an oversight, with two-step confirmation flagged as a future-work item.

### Flow 7: Guests vs. logged-in users
- **Guests losing the Table link** — if a guest closes their browser/tab without bookmarking, they may have no way back into an in-progress Table. Recommend showing the Table Code prominently and persistently (not just at join time), and/or a "text yourself this link" shortcut.
- **The core value prop (running balances over time) only activates for logged-in users** — if most participants stay guests, that differentiator never kicks in for them. Worth a soft nudge after a Table closes: "Sign up to track your balance with [names] automatically next time" — optional, not forced, in keeping with your low-friction stance.

### Flow 8: Connectivity
- Restaurants often have poor wifi/data. Real-time claim syncing should queue actions locally and retry rather than silently fail — a claim that looks "saved" on one phone but never synced is a bad, hard-to-detect failure mode. Worth explicitly designing a "syncing…" vs. "synced" indicator per action.

---

## 10. Thesis Alignment Notes

- **Strongest evaluable contribution:** LLM receipt parsing accuracy vs. traditional OCR — this can be a real benchmark chapter with a test set of receipts.
- **Design justification chapter:** Explicitly discuss where LLMs were and weren't used (Section 3 above) — this shows critical engineering judgment, not just "AI everywhere."
- **System design chapter:** Architecture diagram + data model above map directly into a thesis "System Design" chapter.
- **Evaluation ideas:** parsing accuracy %, claiming latency, small user study (have your friend group actually use it and report on the "admin bottleneck" reduction qualitatively).
