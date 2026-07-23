# Tably UI Restructure — Implementation Plan for Coding Agent

## Context

`project-plan.md` §5.5 specifies a **Two-Page Session Architecture**: the Ledger
(shared activity feed) and Your Order (private claiming screen) are supposed to
be separate views. During Phase 2, `PROGRESS.md` records that the Ledger was
"rendered on the Table page" instead — i.e. it got merged into the same route
as claiming, item editing, Close/Reopen Tab, and sync status. That's the root
cause of the "everything on one page" problem. The UI also currently uses
default/minimal Tailwind styling with no visual language of its own.

This plan has two parts:
1. **Route/architecture split** — restore the two-page design from the plan.
2. **Visual design pass** — give the app a distinct look instead of default
   Tailwind grays, leaning into the existing dining metaphor (Table, Table
   Code, Your Order, Ledger, Close the Tab).

Read the actual current code first — file paths below are best-guess based on
`PROGRESS.md`/`project-plan.md` naming (`/table/[code]`, `/api/tables/*`). The
agent should confirm actual paths/component names before editing and adjust
this plan's specifics accordingly; the structural intent below is what matters.

---

## Part 1: Route & Architecture Split

### Target structure

```
src/app/table/[code]/
  layout.tsx        ← NEW: shared chrome for both views
  page.tsx           ← Ledger (becomes the default landing view)
  order/
    page.tsx         ← Your Order (claiming screen, moved out)
```

### `layout.tsx` (new)

Owns everything that both views need:

- Fetch/subscribe to table data once here (participants, table meta, closed
  status) — pass down via context or props to avoid duplicating fetch logic
  in both pages.
- Render persistent header containing:
  - Table name / group label
  - **Table Code**, styled distinctly (see Part 2), with a "Copy join link"
    button — always visible, not buried in page body (fixes Flow 7's
    "guests losing the table link" risk from the plan).
  - Segmented control / tab nav: **Ledger | Your Order**, linking to
    `/table/[code]` and `/table/[code]/order`. Active tab visually distinct.
  - Sync status indicator (Saving… / ✓ Synced / ⚠️ Couldn't sync), if it's
    currently rendered per-action inside the merged page — promote a
    table-level summary version of it into this shared header, keep
    per-action indicators local to Your Order.
- If table is closed, both child routes should reflect a "closed" state
  (banner or disabled controls) — layout can pass `isClosed` down.

### `page.tsx` (Ledger — was the merged page)

Keep:
- Chronological activity feed (joins, saves, item edits w/ diffs,
  clarifications raised/resolved, final split generated)
- Clarification inline fix/confirm actions
- Copy Split Summary button
- Close the Tab / Reopen Tab controls
- Settlement summary (once closed)

Remove:
- Claimable item cards / claim-tapping UI → moved to `order/page.tsx`
- Per-item "Edit" action **for claiming purposes** — but note: item edits are
  logged as Ledger events (`ITEM_EDITED`), so the edit *action* itself likely
  belongs on the Your Order page (where the item cards live), while the
  *history* of edits stays visible in the Ledger feed. Don't remove the
  edit affordance from the app — just move it to the page where the item
  card actually lives.

### `order/page.tsx` (Your Order — new file)

Move here:
- Item claim cards (tap to claim, shared-item split indicator)
- "Nothing to claim" action
- Per-item Edit / "Looks right" confirm (for low-confidence items)
- Save button + per-action sync status
- "Edit who paid" control (arguably fits either page — put it here since
  it's part of the same interaction group as claiming/editing items; if the
  agent finds it's more naturally tied to settlement, Ledger is an
  acceptable alternative, use judgment)

Keep this page intentionally sparse — no activity feed, no ledger entries,
no settlement breakdown. Just the claiming "game loop," per the plan's own
description of what this screen should be.

### Navigation / redirects

- `/table/[code]` (bare) → Ledger, so existing join links keep working
  without a redirect.
- After joining a table (`POST /api/tables/[code]/join` success), route the
  user to `order/page.tsx` directly (people join in order to claim), not the
  Ledger — Ledger is reachable via the tab nav.
- After Close the Tab, both pages should be reachable, but consider
  redirecting an in-progress claim session on the Order page to the Ledger
  automatically once closed (since there's nothing left to claim) — with a
  visible "Table closed — view results" message rather than a jarring
  redirect with no explanation.

### Data fetching / real-time

- If Pusher subscription (`useTableChannel`) currently lives in the merged
  page component, lift it into `layout.tsx` so both child routes get live
  updates without double-subscribing.
- Confirm polling fallback (5s) also moves to the layout level for the same
  reason.

---

## Part 2: Visual Design Pass

Goal: move off default Tailwind grays and give the dining metaphor an actual
visual identity, without over-engineering — this is still an MVP.

### Design tokens to introduce (e.g. in `tailwind.config` / a `theme` section)

- **Base palette:** warm neutral background (off-white / cream, not pure
  white or gray-50) to evoke a receipt/paper feel. Dark text, not pure black.
- **Accent color:** one strong accent used consistently for money-forward
  states — "you owe" vs "you're owed" can use two variants of it (e.g. warm
  red-orange for owe, green for owed) rather than generic blue links
  everywhere.
- **Table Code treatment:** monospace or slab-serif font, letter-spaced,
  in a small "ticket stub" styled badge — this is the one element that
  should look the most distinct, since it's the app's shareable artifact.
- **Item cards (Your Order):** style like a receipt line item — item name
  left, price right, tappable state with a clear claimed/unclaimed visual
  (not just a border color change — consider a checkmark or filled
  background on claim).
- **Ledger feed:** timeline/feed layout, not cards-in-a-stack — left-aligned
  vertical rail with small icons per event type (join, save, edit, flag,
  close), timestamps de-emphasized (smaller, muted color) next to each entry.

### Component-level changes

- `NavBar` (root layout, from Phase 3): apply the same token set so
  logged-out/logged-in states don't look like unstyled defaults.
- Settlement summary screen: largest visual moment in the app ("You owe
  Priya ₹340") — this text should be the most prominent thing on the page,
  not styled the same size/weight as surrounding body copy.
- Buttons: differentiate primary actions (Save, Close the Tab) from
  secondary/destructive ones (Reopen, Edit) with consistent button variants
  instead of same-style buttons everywhere.
- Empty states: "nothing claimed yet," "no ledger events yet" — add actual
  copy/icon rather than a blank area, since right now these are likely just
  empty divs.

### Explicitly out of scope for this pass

- No new component library — stay in Tailwind utility classes.
- No animation/motion work unless trivial (e.g. a claim-tap micro-state).
- No redesign of the receipt upload wizard (`/new`... if still present) or
  auth pages unless time permits — priority is the Table Ledger/Order split
  and the item/ledger/settlement visual treatment above.

---

## Part 3: Bug Fixes & Additional UX Details

### 3.1 Numeric input fields defaulting to 0 and mis-parsing entry (e.g. "020")

Symptom: manual-entry fields (item price, quantity, tax, tip, headcount,
etc.) default to `0`, and typing a digit prepends to the existing `0` instead
of replacing it — so typing "2" produces "02", typing another produces "020".

Root cause is almost certainly one of:
- The input is `type="number"` (or text) with `value={0}` and no clearing of
  the default on focus/change, so React re-renders the literal string `"0"`
  concatenated with new keystrokes instead of replacing it.
- The state is initialized to `0` (a number) instead of an empty string, and
  the input's `value` is bound directly to that number, so an empty field
  visually shows nothing but the underlying state re-adds a leading zero on
  each keystroke.

Fix, for every numeric manual-entry field (item price, item quantity, tax,
tip, expected participant count, any "Edit item" prompt/form fields):
- Initialize the underlying state as an **empty string** (`""`), not `0`,
  when the field represents "not yet entered." Only default to an actual
  `0` value if that's a meaningful, intentional starting value (e.g. tip
  defaulting to 0 tip is fine — the bug is about leading-zero concatenation,
  not about whether 0 is a valid default).
- On change, parse with something that strips leading zeros correctly,
  e.g. store the raw string in state for display, and convert with
  `Number(value)` (not string concatenation) only when submitting/using
  the value. Don't do `setValue(value + e.target.value)` anywhere.
- Alternatively/additionally, select-all-on-focus (`e.target.select()`) on
  these fields so a default value is fully replaced by the first keystroke
  rather than appended to.
- Apply `inputMode="decimal"` (price) or `inputMode="numeric"` (quantity,
  headcount) so mobile keyboards show the numeric pad — relevant since the
  plan requires mobile-first.
- Add basic validation/guarding against leading zeros and non-numeric
  characters at the input level (e.g. strip any leading `0` that's followed
  by another digit), not just at submit time.

This bug is currently present anywhere manual numeric entry exists: the
manual-entry fallback form (Phase 1), "Add Missed Item," the "Edit item"
prompt-based control (Phase 4), "Edit who paid" if it has a numeric
component, and the headcount editor (Phase 2/5).

### 3.2 Missing field labels on manual item entry

The manual entry form / "Add Missed Item" form currently has unlabeled
inputs for item name, price, and quantity (presumably relying on
placeholder text alone, which disappears once the user starts typing and
isn't an accessible substitute for a real label).

Fix:
- Add persistent `<label>` elements for each field ("Item name," "Price,"
  "Quantity") — either visible labels above/beside each input, or at
  minimum a floating/persistent label pattern (label shrinks above the
  input on focus/fill, but never fully disappears the way a placeholder
  does).
- Ensure `<label htmlFor>` is correctly associated with each `<input id>`
  for accessibility, not just visual proximity.
- If the "Edit item" control is still the `prompt()`-based interaction
  noted in `PROGRESS.md` (Phase 3/5 pattern), consider replacing it with a
  small inline form with real labeled fields instead of a browser
  `prompt()` — a native `prompt()` can't have labels at all, and also can't
  be styled to match the fix in 3.1, so this is a good moment to upgrade
  that interaction rather than patch around the browser dialog.

### 3.3 Clickable links/buttons have no visual affordance

Symptom: interactive links (join link, Table Code copy, any anchor-styled
text) don't show a pointer cursor and have no visual indication they're
clickable (no underline, color change, hover/focus state).

Fix, applied globally via a shared class or component rather than per
instance:
- Any element with an `onClick` handler that behaves like a link should
  either be a real `<a>`/`<button>` (preferred, for accessibility/keyboard
  nav) or explicitly get `cursor-pointer` in Tailwind if it must stay a
  `<div>`/`<span>`.
- Add a visible affordance: underline on hover, color shift, or subtle
  background change — don't rely on cursor change alone, since it's not
  visible on touch devices anyway (relevant given mobile-first requirement)
  — so touch targets specifically need adequate tap-area sizing and a
  pressed/active state, not just a hover state.
- Add `:focus-visible` styling (outline or ring) for keyboard navigation —
  likely entirely missing right now given the "no indication" symptom.
- Audit every clickable element across both new pages (Ledger, Your Order)
  and the NavBar for this same issue while doing the Part 2 visual pass —
  this is a good one to fix in the same pass as the button-variant work in
  Part 2, since both are about consistent interactive-element styling.

### 3.4 Ledger event copy is noisier than useful

Symptom: a Ledger entry like "Anshul saved their order" fires for every
save, which adds noise without adding information (people expect to save
their claims; it's not a notable event the way "Anshul joined" or "Item X
is now shared between A and B" is).

Fix — review every `AuditLog`/Ledger event type and reclassify:
- **Keep as visible Ledger entries** (things a participant would actually
  want to know about): joined, item added, item edited (with diff),
  simultaneous-claim-made-shared, clarification raised/resolved, who-paid
  changed, Table closed/reopened, final split generated.
- **Demote or remove "saved their order"-style entries.** These are
  candidates for one of:
  - Removing entirely from the Ledger feed (still fine to keep in the raw
    `AuditLog` table for audit purposes — this is about what's *displayed*,
    not what's *recorded*).
  - Replacing with a lightweight non-feed indicator instead — e.g. a small
    "✓ saved" badge next to that participant's name in a participant-list
    area, rather than an inserted timeline entry every time someone taps
    save.
- General principle for the agent to apply when in doubt: an event belongs
  in the Ledger feed if it changes shared state that affects the group
  (an item, a claim, the split, the table status) — not if it's just a
  personal "I'm done" action with no side effect on anyone else's view.

### 3.5 Ledger layout: sticky image/parsed-receipt header, scrollable feed below

Symptom/request: the parsed receipt image and its parsed line-item summary
currently scroll away with everything else. They should stay pinned at the
top of the Ledger, with only the event feed itself scrolling underneath —
and the feed should read top-to-bottom chronologically (oldest at top,
newest at bottom, matching normal chat-log conventions), auto-scrolled to
the latest message.

Fix:
- Restructure the Ledger page (`page.tsx` from Part 1) into two stacked
  regions:
  1. **Fixed/sticky top section** — receipt image (if not yet deleted per
     the plan's retention policy) + parsed item/tax/tip summary. This does
     not scroll with the feed; use `position: sticky; top: 0` on this
     block within the page, or split it into its own non-scrolling
     container above a separately-scrollable feed container (the latter is
     more robust than `sticky` if the page itself scrolls rather than an
     inner container).
  2. **Scrollable feed section below it** — its own scroll container
     (`overflow-y-auto` with a constrained height, e.g.
     `h-[calc(100vh-<header+summary height>)]`) containing the
     chronological entries, oldest → newest top-to-bottom.
- On mount and on every new incoming event (live via Pusher or polling),
  auto-scroll the feed container to the bottom (latest message) — typical
  pattern: a ref on the last item or the container's bottom, called via
  `scrollIntoView({ behavior: "smooth" })` or `scrollTop = scrollHeight`
  after new events append. Only auto-scroll if the user was already near
  the bottom (don't yank someone back down if they've scrolled up to read
  older history) — standard chat-UI pattern.
- Confirm this doesn't conflict with the shared `layout.tsx` header from
  Part 1 (Table Code, tab nav) — that header stays at the very top of the
  whole page as before; the sticky image/summary block is a second,
  Ledger-page-specific sticky region below it, and the scrollable feed is
  the only part that actually scrolls.
- If the receipt image has already been deleted per the plan's data
  retention policy (post-finalize), this top section should show the
  textual parsed summary only, with a placeholder or omitted image slot —
  don't leave a broken image reference.

---

## Part 4: Component Library Adoption (shadcn/ui) & Responsive Layout

The app currently appears to be hand-rolled Tailwind divs/buttons with no
consistent component layer, which compounds every issue above (inconsistent
buttons, no focus states, no responsive breakpoints, ad hoc forms). Rather
than keep patching individual elements, bring in **shadcn/ui** as the base
component layer and rebuild the highest-traffic screens on top of it.

### 4.1 Install & set up shadcn/ui

- Run the shadcn/ui CLI init against this Next.js App Router + Tailwind
  project (`npx shadcn@latest init`). Confirm it detects the existing
  `tailwind.config` / `globals.css` and merges rather than overwrites the
  design tokens introduced in Part 2 — feed the Part 2 palette (warm
  neutral background, accent color) into shadcn's theme CSS variables
  (`--background`, `--primary`, `--destructive`, etc.) so the component
  library picks up the app's identity instead of shipping shadcn's default
  slate theme.
- Pull in components as needed rather than all at once, prioritized by
  where they fix the most complaints from Parts 1–3:
  - `button` — replaces every ad hoc `<button className="...">` with
    consistent primary/secondary/destructive/ghost variants (fixes the
    "no visual indication of clickability" issue in 3.3 for buttons
    specifically, on top of the link-specific fixes there).
  - `input` + `label` (shadcn's `Label` component, paired via `htmlFor`) —
    replaces the unlabeled manual-entry fields from 3.2 with a consistent,
    accessible pattern out of the box.
  - `form` (shadcn's form primitives, typically paired with
    `react-hook-form` + `zod`) — good fit for the manual item-entry /
    "Add Missed Item" form specifically, since it gives real validation
    (catches the leading-zero/invalid-number bug in 3.1 at the schema
    level, not just via manual state handling) and inline error messages
    for free.
  - `dialog` / `sheet` — replace the `prompt()`-based "Edit item" and
    "Edit who paid" interactions (flagged in 3.2 as worth upgrading) with
    a proper modal (desktop) / bottom sheet (mobile) containing labeled
    fields and real buttons instead of a browser dialog.
  - `tabs` — implement the Ledger / Your Order navigation from Part 1's
    `layout.tsx` directly with shadcn's `Tabs` rather than hand-rolled
    nav links, so the active/inactive states, focus rings, and mobile
    tap targets are handled consistently.
  - `badge` — for the "✓ saved" per-participant indicator from 3.4, claim
    status on item cards, and the sync status indicator (Saving… / Synced
    / Couldn't sync).
  - `toast` (sonner, which shadcn wraps) — use for transient confirmations
    that don't need to live in the Ledger feed at all: "Link copied,"
    "Split summary copied," "Saved." This gives immediate feedback for
    actions like the copy buttons without adding more Ledger noise (ties
    directly into 3.4's goal of a quieter feed).
  - `tooltip` — for icon-only buttons (e.g. a copy icon next to the Table
    Code) so their purpose is discoverable without needing a label.
  - `skeleton` — for loading states (receipt parsing, initial table
    fetch) instead of blank/empty divs.
  - `alert` — for the "Table closed," "only 3 of 5 expected have joined,"
    and close-time clarification warnings called out in the plan's UX
    risk audit, so these read as intentional notices rather than plain
    paragraph text.

### 4.2 Responsive layout pass (mobile + desktop)

The plan requires mobile-first, but the app also needs to hold up on
desktop rather than just being a narrow mobile layout stretched wide.
Concretely:

- **Mobile (primary target):**
  - Your Order: single-column item list, large tap targets (min ~44px
    height per item row), claim state clearly visible without needing to
    read text (checkmark + background fill, not just a color change).
  - Bottom-anchored primary action (Save) as a sticky/fixed footer button
    on mobile, so it's always reachable without scrolling — common pattern
    for "commit this screen" actions in checklist-style mobile UIs.
  - Ledger: sticky top region (per 3.5) sized so the scrollable feed still
    gets meaningful vertical space on a phone screen — don't let the
    image+summary block eat more than ~30–40% of viewport height; consider
    a collapsed/thumbnail state for the receipt image on small screens
    with a tap-to-expand.
  - Table Code + copy-link button always reachable within one tap/scroll,
    not just at the very top of a tall page.

- **Desktop:** currently likely just a centered `max-w-2xl` column
  (per Phase 5 notes) stretched into empty side space. Improve by:
  - Introducing a constrained two-column layout on wider viewports where
    it makes sense — e.g. on the Ledger, the sticky receipt/summary block
    could sit in a left column with the scrollable feed in a right column
    on desktop (`lg:` breakpoint), rather than both stacked vertically and
    leaving the rest of the screen blank.
  - On Your Order, a multi-column grid of item cards on wider screens
    (`sm:grid-cols-2 lg:grid-cols-3`) instead of a single narrow column
    stretched with whitespace on either side.
  - Hover states matter more here than on mobile — this is where the
    shadcn button/link hover and focus-visible states (4.1, 3.3) actually
    get seen, so don't skip them just because mobile is the priority
    target.
  - Keep the max content width capped even in a multi-column layout (don't
    let cards stretch edge-to-edge on a large monitor) — a max page width
    around `max-w-4xl` to `max-w-5xl` with centered margins is reasonable.

- **Both:** run an actual breakpoint audit rather than assuming the
  existing `flex flex-col` single-column approach "already works" at
  every size (this was asserted in `PROGRESS.md` Phase 5 but should be
  re-verified now that the Ledger/Order split and shadcn components are
  landing) — test at common breakpoints (375px, 768px, 1024px, 1440px)
  for both new pages plus history/balances/auth screens.

### 4.3 Visual help / discoverability

On top of the component swap, add lightweight affordances that make the
app self-explanatory without a manual:

- Icons (e.g. `lucide-react`, which shadcn is built to pair with)
  alongside key actions — a link/share icon on "Copy join link," a check
  icon on "Nothing to claim," a receipt/ticket icon near the Table Code,
  distinct icons per Ledger event type (join, edit, flag, close) to make
  the feed scannable at a glance rather than reading every line of text.
- Empty states get an icon + short copy instead of a blank div (ties into
  the empty-state note in Part 2).
- First-time inline hints where a flow could be non-obvious — e.g. a
  small caption under the participant count field ("You can change this
  later") to defuse the friction point called out in the plan's Flow 1
  risk audit, or a brief label under the debt-view toggle explaining
  simplified vs. individual.

---

## Suggested Execution Order

1. Read current `src/app/table/[code]/page.tsx` and related components in
   `src/components/` to confirm actual structure before moving anything.
2. Install and configure shadcn/ui (4.1), wiring the Part 2 design tokens
   into its theme variables before building/rebuilding any screens on top
   of it — doing this first avoids restyling components twice.
3. Create `layout.tsx`, move shared header/nav/table-code/sync-status logic
   into it, using shadcn's `Tabs` for the Ledger/Your Order nav.
4. Split remaining page content into Ledger (`page.tsx`) vs Your Order
   (`order/page.tsx`) per the Part 1 breakdown, rebuilding item cards,
   forms, and dialogs with shadcn components (`button`, `input`, `label`,
   `form`, `dialog`/`sheet`, `badge`, `alert`) as you go.
5. Fix the post-join redirect to land on Your Order.
6. Verify Pusher/polling still fires correctly on both routes (no duplicate
   subscriptions, no missed updates).
7. Fix numeric input handling (3.1) and add missing field labels (3.2) —
   the shadcn `form` + `label` components from step 2 should make this
   mostly mechanical at this point.
8. Reclassify Ledger event types (3.4), swapping "saved their order"-style
   noise for `toast` confirmations where appropriate, and rebuild the
   Ledger page layout with the sticky image/summary header + scrollable,
   auto-scrolling feed (3.5).
9. Apply the remaining visual design pass (Part 2) and clickable-affordance
   fixes (3.3) to anything not already covered by the shadcn swap.
10. Do the responsive layout pass (4.2) and add discoverability touches
    (4.3 — icons, empty states, inline hints).
11. Re-run the existing manual smoke test flow from `PROGRESS.md` (create
    table → second guest joins → claim → close → check Ledger/Order both
    render correctly), specifically re-testing manual item entry with values
    like typing "20" into a defaulted-to-0 price field, and test at each of
    the four breakpoints listed in 4.2 (375px, 768px, 1024px, 1440px).
12. Update `PROGRESS.md` with a new change-log entry noting the route split,
    shadcn/ui adoption, design pass, and bug fixes, consistent with how
    prior phases were documented.
