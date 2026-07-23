"use client";

import { useEffect, useRef, useState } from "react";
import {
  UserPlus,
  ShoppingBag,
  Users,
  Flag,
  CheckCircle2,
  Hash,
  CreditCard,
  Lock,
  Unlock,
  Receipt,
  Link2,
  Copy,
  Check,
} from "lucide-react";
import { useTable } from "./table-context";
import { PersonTag } from "./PersonTag";
import { describeAudit, isFeedVisible, auditIconKind, type AuditIconKind } from "@/lib/auditDescribe";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS: Record<AuditIconKind, React.ComponentType<{ className?: string }>> = {
  join: UserPlus,
  item: ShoppingBag,
  claim: Users,
  flag: Flag,
  check: CheckCircle2,
  count: Hash,
  payer: CreditCard,
  close: Lock,
  reopen: Unlock,
  settle: CheckCircle2,
  link: Link2,
  default: Receipt,
};

/**
 * Ledger — the shared activity feed (project-plan.md §5.5). Kept
 * intentionally free of claiming UI (that lives on Your Order); this page
 * owns the chronological event feed, clarifications, Close/Reopen the Tab,
 * and the settlement summary once closed.
 */
export default function LedgerPage() {
  const { table, identity, nameOf, colorClassOf, code, authedFetch, refresh } = useTable();
  const [settlementView, setSettlementView] = useState<"SIMPLIFIED" | "INDIVIDUAL">("SIMPLIFIED");
  const [copyLabel, setCopyLabel] = useState<"idle" | "copied">("idle");
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);

  const visibleLogs = table ? table.auditLogs.filter(isFeedVisible) : [];

  // Auto-scroll the feed to the latest entry, but only if the user was
  // already near the bottom (don't yank them away from history they've
  // scrolled up to read) — standard chat-UI pattern (3.5).
  useEffect(() => {
    const el = feedRef.current;
    if (!el || !wasNearBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleLogs.length]);

  function handleFeedScroll() {
    const el = feedRef.current;
    if (!el) return;
    wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  if (!table) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const itemsTotal = table.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const grandTotal = itemsTotal + table.taxAmount + table.tipAmount;
  const settlements = table.settlements;
  const payments = table.payments.length > 0
    ? table.payments
    : table.paidByParticipantId
      ? [{ id: "legacy", participantId: table.paidByParticipantId, amount: grandTotal }]
      : [];
  const joinedCount = table.participants.length;
  const allSaved = table.participants.every((p) => p.hasSaved);
  const readyToClose = joinedCount >= table.expectedParticipants && allSaved;
  const notSaved = table.participants.filter((p) => !p.hasSaved);
  const unresolvedClarifications = table.items.filter((it) => it.lowConfidence);
  const unclaimedItems = table.items.filter((it) => it.claims.length === 0);

  async function closeTab() {
    const res = await authedFetch(`/api/tables/${code}/finalize`);
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => ({}));
      setCloseError(body?.error ?? "Couldn't close the Tab — try again.");
      return;
    }
    setCloseError(null);
    setShowCloseWarning(false);
    refresh();
  }

  async function reopenTab() {
    await authedFetch(`/api/tables/${code}/reopen`);
    refresh();
  }

  async function markSettled(id: string) {
    await authedFetch(`/api/tables/${code}/settlements/${id}/settle`);
    refresh();
  }

  function copySummary() {
    const lines = [
      `Table ${table!.tableCode} — ₹${grandTotal.toFixed(2)} total`,
      "",
      "Items:",
      ...table!.items.map(
        (it) =>
          `- ${it.name} × ${it.quantity} (₹${(it.price * it.quantity).toFixed(2)}): ${
            it.claims.length ? it.claims.map((c) => nameOf(c.participantId)).join(", ") : "unclaimed"
          }`,
      ),
      "",
      "Settlement:",
      ...settlements
        .filter((s) => s.viewMode === settlementView)
        .map((s) => `- ${nameOf(s.fromParticipantId)} owes ${nameOf(s.toParticipantId)} ₹${s.amount.toFixed(2)}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopyLabel("copied");
      setTimeout(() => setCopyLabel("idle"), 1500);
    });
  }

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Left column on desktop / top stack on mobile. Only the receipt image
          + parsed item summary is height-constrained/scrollable in its own
          box (3.5's "sticky image/summary" requirement) — participants,
          close-tab, and settlement flow normally below it so they're never
          clipped (this used to be one shared max-h box, which visually cut
          off the Participants/Close-tab cards on short mobile viewports). */}
      <div className="flex flex-col gap-4 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
        <div className="flex max-h-[35vh] flex-col gap-4 overflow-y-auto sm:max-h-[40vh]">
          {table.imageUrl ? (
            <div className="overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary
                  receipt-upload source (data URL or external), not a known
                  remote pattern for next/image to optimize */}
              <img
                src={table.imageUrl}
                alt="Parsed receipt"
                className="h-auto max-h-56 w-full object-contain bg-muted"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Receipt image not available (deleted after finalizing, or never uploaded).
            </div>
          )}

          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold">Parsed items</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {table.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {item.name} × {item.quantity}
                    {item.lowConfidence && (
                      <Badge variant="outline" className="ml-1.5 gap-1 text-amber-600">
                        <Flag className="size-3" /> needs check
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">₹{(item.price * item.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-col gap-0.5 border-t pt-2 text-xs text-muted-foreground">
              <span className="flex justify-between">
                <span>Tax &amp; tip</span>{" "}
                <span>₹{(table.taxAmount + table.tipAmount).toFixed(2)}</span>
              </span>
              <span className="flex justify-between font-medium text-foreground">
                <span>Total</span> <span>₹{grandTotal.toFixed(2)}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">Participants</h2>
          <ul className="flex flex-wrap gap-1.5">
            {table.participants.map((p) => (
              <li key={p.id}>
                <Badge
                  variant="outline"
                  className={`gap-1 border-transparent font-medium ${colorClassOf(p.id)} ${
                    p.hasSaved ? "" : "opacity-60"
                  }`}
                >
                  {p.hasSaved && <Check className="size-3" />}
                  {p.displayName}
                </Badge>
              </li>
            ))}
          </ul>
          {joinedCount < table.expectedParticipants && (
            <Alert className="mt-2">
              <AlertDescription>
                Only {joinedCount} of {table.expectedParticipants} expected have joined — share
                the Table Code above.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {table.status === "OPEN" ? (
          <div className="rounded-lg border p-3">
            {readyToClose && unresolvedClarifications.length === 0 && unclaimedItems.length === 0 && (
              <Alert className="mb-2 border-owed/40 bg-owed/10 text-owed">
                <AlertDescription className="text-owed">
                  {joinedCount}/{table.expectedParticipants} joined, everyone&apos;s saved. Ready
                  to close the tab!
                </AlertDescription>
              </Alert>
            )}
            {unclaimedItems.length > 0 && (
              <Alert variant="destructive" className="mb-2">
                <AlertDescription>
                  {unclaimedItems.length} item(s) still have no one claiming them (
                  {unclaimedItems.map((it) => it.name).join(", ")}) — every item needs a claimant
                  before the Tab can close. Head to the Order page to assign them.
                </AlertDescription>
              </Alert>
            )}
            <Button
              onClick={() =>
                readyToClose && unresolvedClarifications.length === 0 && unclaimedItems.length === 0
                  ? closeTab()
                  : setShowCloseWarning(true)
              }
            >
              Close the Tab
            </Button>
            {closeError && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>{closeError}</AlertDescription>
              </Alert>
            )}
            {showCloseWarning && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>
                  {notSaved.length > 0
                    ? `Not everyone has saved yet: ${notSaved.map((p) => p.displayName).join(", ")}. `
                    : joinedCount < table.expectedParticipants
                      ? "Not all expected participants have joined yet. "
                      : ""}
                  {unresolvedClarifications.length > 0 &&
                    `${unresolvedClarifications.length} item(s) still have low-confidence flags (${unresolvedClarifications
                      .map((it) => it.name)
                      .join(", ")}) — they'll be used as-is if you close now. `}
                  {unclaimedItems.length > 0
                    ? `${unclaimedItems.length} item(s) are unclaimed (${unclaimedItems
                        .map((it) => it.name)
                        .join(", ")}) — claim everything before closing; this can't be overridden.`
                    : (
                      <>
                        Close anyway?
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="destructive" onClick={closeTab}>
                            Close anyway
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowCloseWarning(false)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Final Split</h2>
              <Button variant="outline" size="sm" onClick={copySummary} className="gap-1.5">
                <Copy className="size-3.5" />
                {copyLabel === "copied" ? "Copied!" : "Copy Split Summary"}
              </Button>
            </div>
            <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span>Paid by</span>
              {payments.map((pay) => (
                <span key={pay.id} className="inline-flex items-center gap-1">
                  <PersonTag name={nameOf(pay.participantId)} colorClass={colorClassOf(pay.participantId)} />
                  <span className="tabular-nums">₹{pay.amount.toFixed(2)}</span>
                </span>
              ))}
            </p>

            <div className="mb-2 flex gap-2 text-sm">
              <Button
                size="sm"
                variant={settlementView === "SIMPLIFIED" ? "default" : "secondary"}
                onClick={() => setSettlementView("SIMPLIFIED")}
              >
                Simplified
              </Button>
              <Button
                size="sm"
                variant={settlementView === "INDIVIDUAL" ? "default" : "secondary"}
                onClick={() => setSettlementView("INDIVIDUAL")}
              >
                Individual
              </Button>
            </div>

            {/* Largest visual moment in the app (Part 2): who owes whom, in
                large prominent text — not styled like body copy. */}
            <ul className="flex flex-col gap-2">
              {settlements
                .filter((s) => s.viewMode === settlementView)
                .map((s) => {
                  const iOwe = identity && s.fromParticipantId === identity.participantId;
                  const owedToMe = identity && s.toParticipantId === identity.participantId;
                  return (
                    <li
                      key={s.id}
                      className={`flex items-center justify-between rounded-md border p-2.5 ${
                        iOwe ? "border-owe/30 bg-owe/5" : owedToMe ? "border-owed/30 bg-owed/5" : ""
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-1.5 text-sm">
                        <PersonTag
                          name={nameOf(s.fromParticipantId)}
                          colorClass={colorClassOf(s.fromParticipantId)}
                          className={iOwe ? "ring-2 ring-owe/50" : undefined}
                        />
                        <span className="text-muted-foreground">owes</span>
                        <PersonTag
                          name={nameOf(s.toParticipantId)}
                          colorClass={colorClassOf(s.toParticipantId)}
                          className={owedToMe ? "ring-2 ring-owed/50" : undefined}
                        />
                      </span>
                      <span className="flex items-center gap-2">
                        <strong
                          className={`text-lg ${iOwe ? "text-owe" : owedToMe ? "text-owed" : ""}`}
                        >
                          ₹{s.amount.toFixed(2)}
                        </strong>
                        {s.settled ? (
                          <Badge className="gap-1 bg-owed text-owed-foreground">
                            <Check className="size-3" /> Settled
                          </Badge>
                        ) : (
                          <Button size="xs" variant="ghost" onClick={() => markSettled(s.id)}>
                            Mark settled
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>

            <Button variant="ghost" size="sm" className="mt-3" onClick={reopenTab}>
              Reopen Tab
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable feed — the only part of the page that scrolls, reading
          top-to-bottom chronologically like a chat log (3.5). */}
      <div className="flex flex-col overflow-hidden rounded-lg border">
        <h2 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">Ledger</h2>
        <div
          ref={feedRef}
          onScroll={handleFeedScroll}
          className="flex h-[50vh] flex-col gap-3 overflow-y-auto p-3 lg:h-[calc(100vh-14rem)]"
        >
          {visibleLogs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Receipt className="size-8 opacity-50" />
              <p>No ledger events yet — activity will show up here as people join and claim.</p>
            </div>
          ) : (
            <ol className="relative flex flex-col gap-4 border-l border-border pl-4">
              {visibleLogs.map((log) => {
                const Icon = ICONS[auditIconKind(log)];
                return (
                  <li key={log.id} className="relative">
                    <span className="absolute -left-[1.4rem] flex size-6 items-center justify-center rounded-full border bg-background">
                      <Icon className="size-3.5 text-primary" />
                    </span>
                    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
                      {describeAudit(log).map((part, i) =>
                        part.type === "name" ? (
                          <PersonTag
                            key={i}
                            name={part.participantId ? nameOf(part.participantId) : part.fallback}
                            colorClass={
                              part.participantId
                                ? colorClassOf(part.participantId)
                                : "bg-muted text-muted-foreground"
                            }
                          />
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
