"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getGuestIdentity, type GuestIdentity } from "@/lib/guestIdentity";
import { useTableChannel, isRealtimeConfigured } from "@/lib/pusherClient";

type Claim = { id: string; participantId: string; shareFraction: number };
type Item = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  lowConfidence: boolean;
  claims: Claim[];
};
type Participant = {
  id: string;
  displayName: string;
  hasSaved: boolean;
  joinedAt: string;
  userId: string | null;
};
type Settlement = {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
  viewMode: "SIMPLIFIED" | "INDIVIDUAL";
  settled: boolean;
};
type AuditLog = {
  id: string;
  participantId: string | null;
  actionType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
};
type TableState = {
  id: string;
  tableCode: string;
  status: "OPEN" | "CLOSED";
  taxAmount: number;
  tipAmount: number;
  expectedParticipants: number;
  paidByParticipantId: string | null;
  participants: Participant[];
  items: Item[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
};

function describeAudit(log: AuditLog, nameOf: (id: string | null) => string): string {
  const details = log.details ? safeJson(log.details) : {};
  switch (log.actionType) {
    case "BILL_CREATED":
      return `Table created (expecting ${details.expectedParticipants ?? "?"} people)`;
    case "PARTICIPANT_JOINED":
      return `${details.displayName ?? nameOf(log.participantId)} joined`;
    case "ITEM_ADDED":
      return `${nameOf(log.participantId)} added "${details.name}"`;
    case "ITEM_EDITED": {
      const before = (details.before as Record<string, unknown>) ?? {};
      const after = (details.after as Record<string, unknown>) ?? {};
      const changes = Object.entries(after)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${before[k]} → ${v}`);
      return changes.length > 0
        ? `${nameOf(log.participantId)} corrected an item (${changes.join(", ")})`
        : `${nameOf(log.participantId)} confirmed an item was correct`;
    }
    case "CLAIM_SAVED":
      return `${nameOf(log.participantId)} saved their order`;
    case "CLAIM_EDITED":
      return `${nameOf(log.participantId)} updated a claim`;
    case "ITEM_BECAME_SHARED":
      return `An item is now shared between ${((details.participantIds as string[]) ?? [])
        .map((id: string) => nameOf(id))
        .join(", ")}`;
    case "PARTICIPANT_COUNT_CHANGED":
      return `Expected headcount changed to ${details.expectedParticipants}`;
    case "PAYER_CHANGED":
      return `${details.displayName ?? "Someone"} is now marked as having paid`;
    case "TAB_CLOSED":
      return "Final split generated — Tab closed";
    case "TAB_REOPENED":
      return "Tab reopened";
    case "SETTLEMENT_MARKED_PAID":
      return `A settlement of ₹${details.amount ?? "?"} was marked as paid`;
    case "CLARIFICATION_RAISED":
      return `⚠️ Low confidence on "${details.name}" — needs a quick check`;
    case "CLARIFICATION_RESOLVED":
      return `✓ "${details.name}" confirmed`;
    case "PARTICIPANT_LINKED_ACCOUNT":
      return `${nameOf(log.participantId)} linked their account`;
    default:
      return log.actionType;
  }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function TablePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code.toUpperCase();
  const { data: session, status: sessionStatus } = useSession();

  const [table, setTable] = useState<TableState | null>(null);
  const [identity] = useState<GuestIdentity | null>(() => getGuestIdentity(code));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlementView, setSettlementView] = useState<"SIMPLIFIED" | "INDIVIDUAL">("SIMPLIFIED");
  const [copyLabel, setCopyLabel] = useState("Copy Split Summary");
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "synced" | "error">("idle");
  const [linkCopyLabel, setLinkCopyLabel] = useState("Copy join link");

  const identityRef = useRef<GuestIdentity | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tables/${code}`);
    if (res.status === 404) {
      setError("Table not found.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTable(data);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    const id = getGuestIdentity(code);
    identityRef.current = id;
    // Data fetch on mount/code-change — the documented, appropriate use of an
    // effect for synchronizing with an external system (the API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [code, refresh]);

  // Live sync via Pusher; falls back to polling every 5s if not configured
  // (project-plan.md §6: latency should feel live, but must never silently fail).
  useTableChannel(code, {
    "participant-joined": refresh,
    "claim-updated": refresh,
    "item-added": refresh,
    "item-edited": refresh,
    "participant-saved": refresh,
    "participant-count-changed": refresh,
    "payer-changed": refresh,
    "tab-closed": refresh,
    "tab-reopened": refresh,
    "settlement-marked-paid": refresh,
  });

  useEffect(() => {
    if (isRealtimeConfigured()) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!loading && table && table.status === "OPEN" && !identity) {
      router.push(`/join/${code}`);
    }
  }, [loading, table, identity, code, router]);

  if (loading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-500">{error}</div>;
  if (!table) return null;

  const nameOf = (id: string | null) =>
    table.participants.find((p) => p.id === id)?.displayName ?? "Someone";

  const me = identity ? table.participants.find((p) => p.id === identity.participantId) : null;

  const itemsTotal = table.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const grandTotal = itemsTotal + table.taxAmount + table.tipAmount;

  const joinedCount = table.participants.length;
  const allSaved = table.participants.every((p) => p.hasSaved);
  const readyToClose = joinedCount >= table.expectedParticipants && allSaved;
  const notSaved = table.participants.filter((p) => !p.hasSaved);
  const unresolvedClarifications = table.items.filter((it) => it.lowConfidence);

  async function authedFetch(path: string, body: Record<string, unknown> = {}) {
    const id = identityRef.current;
    const payload = JSON.stringify({
      participantId: id?.participantId,
      guestToken: id?.guestToken,
      ...body,
    });
    // Restaurant wifi is often flaky (project-plan.md §9 Flow 8) — never
    // silently drop an action. We're not a full offline queue (documented
    // MVP simplification, see PROGRESS.md Change Log), but we do retry once
    // and surface a persistent error if both attempts fail, rather than
    // letting an action look "saved" on screen when it never synced.
    setSyncStatus("saving");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        if (res.ok) {
          setSyncStatus("synced");
          setTimeout(() => setSyncStatus((s) => (s === "synced" ? "idle" : s)), 1500);
          return res;
        }
      } catch {
        // network error — fall through to retry/final error state
      }
    }
    setSyncStatus("error");
    return null;
  }

  async function toggleClaim(itemId: string) {
    if (!identity) return;
    await authedFetch(`/api/tables/${code}/claims`, { itemId });
    refresh();
  }

  async function saveOrder() {
    if (!identity) return;
    await authedFetch(`/api/tables/${code}/participants/${identity.participantId}/save`);
    refresh();
  }

  async function addItem() {
    if (!identity || !newItemName || !newItemPrice) return;
    await authedFetch(`/api/tables/${code}/items`, {
      name: newItemName,
      price: Number(newItemPrice),
      quantity: 1,
    });
    setNewItemName("");
    setNewItemPrice("");
    refresh();
  }

  async function editItem(item: Item, patch: Partial<Pick<Item, "name" | "price" | "quantity">> = {}) {
    if (!identity) return;
    const id = identityRef.current;
    await fetch(`/api/tables/${code}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantId: id?.participantId,
        guestToken: id?.guestToken,
        ...patch,
      }),
    });
    refresh();
  }

  function promptEditItem(item: Item) {
    const name = prompt("Item name", item.name);
    if (name === null) return;
    const priceStr = prompt("Price (per unit)", String(item.price));
    if (priceStr === null) return;
    const qtyStr = prompt("Quantity", String(item.quantity));
    if (qtyStr === null) return;
    const price = Number(priceStr);
    const quantity = Number(qtyStr);
    if (!name || Number.isNaN(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
      alert("Please enter a valid name, price, and quantity.");
      return;
    }
    editItem(item, { name, price, quantity });
  }

  async function updateExpectedCount(n: number) {
    await fetch(`/api/tables/${code}/participants/count`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedParticipants: n }),
    });
    refresh();
  }

  async function closeTab() {
    await fetch(`/api/tables/${code}/finalize`, { method: "POST" });
    setShowCloseWarning(false);
    refresh();
  }

  async function reopenTab() {
    await fetch(`/api/tables/${code}/reopen`, { method: "POST" });
    refresh();
  }

  async function markSettled(id: string) {
    await fetch(`/api/tables/${code}/settlements/${id}/settle`, { method: "POST" });
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
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy Split Summary"), 1500);
    });
  }

  const settlements = table.settlements;
  const paidByName = table.paidByParticipantId ? nameOf(table.paidByParticipantId) : "unknown";

  async function updatePayer() {
    const options = table!.participants.map((p, i) => `${i + 1}. ${p.displayName}`).join("\n");
    const choice = prompt(`Who paid?\n${options}\n\nEnter a number:`);
    if (!choice) return;
    const idx = Number(choice) - 1;
    const chosen = table!.participants[idx];
    if (!chosen) return;
    const res = await fetch(`/api/tables/${code}/payer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: chosen.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Couldn't update payer.");
    }
    refresh();
  }

  function copyJoinLink() {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopyLabel("Copied!");
      setTimeout(() => setLinkCopyLabel("Copy join link"), 1500);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Table {table.tableCode}</h1>
          {syncStatus !== "idle" && (
            <span
              className={`text-xs ${
                syncStatus === "error"
                  ? "text-red-500"
                  : syncStatus === "saving"
                    ? "text-zinc-400"
                    : "text-emerald-600"
              }`}
            >
              {syncStatus === "saving" && "Saving…"}
              {syncStatus === "synced" && "✓ Synced"}
              {syncStatus === "error" &&
                "⚠️ Couldn't sync — check your connection and try again"}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500">
          {joinedCount}/{table.expectedParticipants} joined · Total ₹{grandTotal.toFixed(2)} ·{" "}
          {table.status === "OPEN" ? "Open" : "Closed"} · Paid by {paidByName}
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          {table.status === "OPEN" && (
            <>
              <button
                className="underline"
                onClick={() => {
                  const n = prompt("Update expected headcount", String(table.expectedParticipants));
                  if (n && Number(n) > 0) updateExpectedCount(Number(n));
                }}
              >
                Edit expected headcount
              </button>
              <button className="underline" onClick={updatePayer}>
                Edit who paid
              </button>
            </>
          )}
          {table.status === "CLOSED" && (
            <span className="text-zinc-400">
              Paid by {paidByName} — reopen the Tab to change this
            </span>
          )}
          <button className="underline" onClick={copyJoinLink}>
            {linkCopyLabel}
          </button>
        </div>
        {table.status === "OPEN" && joinedCount < table.expectedParticipants && (
          <p className="rounded-md bg-zinc-50 p-2 text-xs text-zinc-500 dark:bg-zinc-900">
            Only {joinedCount} of {table.expectedParticipants} expected have joined — share the
            code above, or update the headcount if fewer people are coming.
          </p>
        )}
      </header>

      {table.status === "OPEN" ? (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Your Order</h2>
            <p className="mb-2 text-xs text-zinc-500">
              You are: <strong>{me?.displayName ?? "…"}</strong>
            </p>
            <div className="flex flex-col gap-2">
              {table.items.map((item) => {
                const mine = identity && item.claims.some((c) => c.participantId === identity.participantId);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
                      mine
                        ? "border-black bg-zinc-100 dark:border-white dark:bg-zinc-800"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <button
                      onClick={() => toggleClaim(item.id)}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium">
                        {item.name} × {item.quantity}{" "}
                        {item.lowConfidence && <span title="LLM unsure">⚠️</span>}
                      </div>
                      <div className="text-zinc-500">
                        {item.claims.length > 0
                          ? item.claims.map((c) => nameOf(c.participantId)).join(", ")
                          : "Unclaimed — tap to claim"}
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                      <div className="flex gap-2 text-xs text-zinc-500">
                        <button className="underline" onClick={() => promptEditItem(item)}>
                          Edit
                        </button>
                        {item.lowConfidence && (
                          <button className="underline" onClick={() => editItem(item)}>
                            Looks right
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="Add missed item"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
              />
              <input
                className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="Price"
                type="number"
                value={newItemPrice}
                onChange={(e) => setNewItemPrice(e.target.value)}
              />
              <button
                className="rounded bg-zinc-200 px-3 py-1 text-sm dark:bg-zinc-800"
                onClick={addItem}
              >
                Add
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                disabled={!identity || me?.hasSaved}
                onClick={saveOrder}
              >
                {me?.hasSaved ? "Order saved ✓" : "Save my order"}
              </button>
              {!me?.hasSaved && (
                <button className="text-sm text-zinc-500 underline" onClick={saveOrder}>
                  Nothing to claim
                </button>
              )}
            </div>
          </section>

          <section>
            {readyToClose && unresolvedClarifications.length === 0 && (
              <p className="mb-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {joinedCount}/{table.expectedParticipants} joined, everyone&apos;s saved — ready to
                close the tab!
              </p>
            )}
            <button
              className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              onClick={() =>
                readyToClose && unresolvedClarifications.length === 0
                  ? closeTab()
                  : setShowCloseWarning(true)
              }
            >
              Close the Tab
            </button>
            {showCloseWarning && (
              <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <p>
                  {notSaved.length > 0
                    ? `Not everyone has saved yet: ${notSaved.map((p) => p.displayName).join(", ")}. `
                    : joinedCount < table.expectedParticipants
                      ? "Not all expected participants have joined yet. "
                      : ""}
                  {unresolvedClarifications.length > 0 &&
                    `${unresolvedClarifications.length} item(s) still have low-confidence flags (${unresolvedClarifications
                      .map((it) => it.name)
                      .join(", ")}) — they'll be used as-is if you close now. `}
                  Close anyway?
                </p>
                <div className="mt-2 flex gap-2">
                  <button className="rounded bg-black px-3 py-1 text-white dark:bg-white dark:text-black" onClick={closeTab}>
                    Close anyway
                  </button>
                  <button className="text-zinc-500 underline" onClick={() => setShowCloseWarning(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Final Split</h2>
              <button className="rounded bg-zinc-200 px-3 py-1 text-xs dark:bg-zinc-800" onClick={copySummary}>
                {copyLabel}
              </button>
            </div>
            <ul className="mb-3 flex flex-col gap-2">
              {table.items.map((item) => (
                <li key={item.id} className="flex justify-between rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <div>
                    <div className="font-medium">
                      {item.name} × {item.quantity}
                    </div>
                    <div className="text-zinc-500">
                      {item.claims.length ? item.claims.map((c) => nameOf(c.participantId)).join(", ") : "Unclaimed"}
                    </div>
                  </div>
                  <div>₹{(item.price * item.quantity).toFixed(2)}</div>
                </li>
              ))}
            </ul>

            <div className="mb-2 flex gap-2 text-sm">
              <button
                className={`rounded px-3 py-1 ${settlementView === "SIMPLIFIED" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-zinc-100 dark:bg-zinc-800"}`}
                onClick={() => setSettlementView("SIMPLIFIED")}
              >
                Simplified
              </button>
              <button
                className={`rounded px-3 py-1 ${settlementView === "INDIVIDUAL" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-zinc-100 dark:bg-zinc-800"}`}
                onClick={() => setSettlementView("INDIVIDUAL")}
              >
                Individual
              </button>
            </div>

            <ul className="flex flex-col gap-1 text-sm">
              {settlements
                .filter((s) => s.viewMode === settlementView)
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between">
                    <span>
                      {nameOf(s.fromParticipantId)} owes {nameOf(s.toParticipantId)}{" "}
                      <strong>₹{s.amount.toFixed(2)}</strong>
                      {s.settled && <span className="ml-1 text-emerald-600">✓ settled</span>}
                    </span>
                    {!s.settled && (
                      <button className="text-xs text-zinc-500 underline" onClick={() => markSettled(s.id)}>
                        Mark settled
                      </button>
                    )}
                  </li>
                ))}
            </ul>

            <button className="mt-4 text-sm text-zinc-500 underline" onClick={reopenTab}>
              Reopen Tab
            </button>
          </section>

          {me && !me.userId && sessionStatus !== "authenticated" && identity && (
            <section className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
              <p className="mb-2">
                Sign up to track your balance with everyone here automatically, next time too.
              </p>
              <a
                className="rounded bg-black px-3 py-1.5 text-white dark:bg-white dark:text-black"
                href={`/signup?mergeTable=${code}&mergeParticipant=${identity.participantId}&mergeToken=${identity.guestToken}`}
              >
                Sign up
              </a>
            </section>
          )}
          {me && !me.userId && sessionStatus === "authenticated" && identity && (
            <section className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
              <p className="mb-2">
                You&apos;re logged in as {session?.user?.name ?? session?.user?.email} — link this
                Table to your account to include it in your balances.
              </p>
              <button
                className="rounded bg-black px-3 py-1.5 text-white dark:bg-white dark:text-black"
                onClick={async () => {
                  await fetch(`/api/tables/${code}/participants/${identity.participantId}/merge`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guestToken: identity.guestToken }),
                  });
                  router.refresh();
                  window.location.reload();
                }}
              >
                Link account
              </button>
            </section>
          )}
        </>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Ledger</h2>
        <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          {table.auditLogs.map((log) => (
            <li key={log.id}>{describeAudit(log, nameOf)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
