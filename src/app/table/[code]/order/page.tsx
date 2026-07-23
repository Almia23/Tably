"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, ReceiptText, Users2 } from "lucide-react";
import { useTable } from "../table-context";
import { EditItemDialog } from "../EditItemDialog";
import { EditPayerDialog } from "../EditPayerDialog";
import { EditHeadcountDialog } from "../EditHeadcountDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Item } from "@/types/table";

/**
 * Your Order — the private claiming screen (project-plan.md §5.5). Kept
 * intentionally sparse: just the claiming "game loop" (item cards, add
 * missed item, save), no activity feed or settlement breakdown — those
 * live on the Ledger.
 */
export default function OrderPage() {
  const { table, identity, nameOf, code, authedFetch, refresh } = useTable();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  // "Add missed item" fields kept as strings (not numbers) so the price
  // field doesn't default to a literal 0 that gets prepended to on typing
  // (3.1) — Number(...) conversion only happens on submit.
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editPayerOpen, setEditPayerOpen] = useState(false);
  const [editHeadcountOpen, setEditHeadcountOpen] = useState(false);

  if (!table) return null;

  if (table.status === "CLOSED") {
    return (
      <Alert>
        <AlertDescription>
          Table closed — there&apos;s nothing left to claim.{" "}
          <button className="link-affordance" onClick={() => router.push(`/table/${code}`)}>
            View results in the Ledger
          </button>
          .
        </AlertDescription>
      </Alert>
    );
  }

  const me = identity ? table.participants.find((p) => p.id === identity.participantId) : null;
  const paidByName = table.paidByParticipantId ? nameOf(table.paidByParticipantId) : "unknown";

  async function toggleClaim(itemId: string) {
    if (!identity) return;
    const res = await authedFetch(`/api/tables/${code}/claims`, { itemId });
    if (!res) toast.error("Couldn't save your claim — check your connection.");
    refresh();
  }

  async function saveOrder() {
    if (!identity) return;
    const res = await authedFetch(`/api/tables/${code}/participants/${identity.participantId}/save`);
    // "Saved my order" is a personal, no-side-effect-on-others action, so it
    // gets a toast instead of a Ledger feed entry (3.4) — the feed only
    // shows things that change shared state.
    if (res) {
      toast.success("Order saved");
      // Once someone's done claiming, send them to the Ledger so they can
      // watch the running activity/settlement history instead of staying
      // stuck on a now-inert "Order saved" screen.
      router.push(`/table/${code}`);
    } else {
      toast.error("Couldn't save — check your connection and try again.");
    }
    refresh();
  }

  async function addItem() {
    if (!identity || !newItemName || !newItemPrice) return;
    const price = Number(newItemPrice);
    if (Number.isNaN(price) || price < 0) return;
    const res = await authedFetch(`/api/tables/${code}/items`, {
      name: newItemName,
      price,
      quantity: 1,
    });
    if (res) {
      setNewItemName("");
      setNewItemPrice("");
      toast.success(`Added "${newItemName}"`);
    } else {
      toast.error("Couldn't add item — check your connection.");
    }
    refresh();
  }

  async function saveEditedItem(item: Item, patch: { name: string; price: number; quantity: number }) {
    const res = await authedFetch(`/api/tables/${code}/items/${item.id}`, patch, "PATCH");
    if (!res) toast.error("Couldn't save item edit — check your connection.");
    refresh();
  }

  async function confirmItemLooksRight(item: Item) {
    // An empty patch still clears the item's lowConfidence flag server-side
    // and logs CLARIFICATION_RESOLVED — this is the "Looks right" affordance.
    await authedFetch(`/api/tables/${code}/items/${item.id}`, {}, "PATCH");
    refresh();
  }

  async function updateExpectedCount(n: number) {
    const res = await authedFetch(`/api/tables/${code}/participants/count`, { expectedParticipants: n }, "PATCH");
    if (!res) toast.error("Couldn't update headcount.");
    refresh();
  }

  async function updatePayer(participantId: string) {
    const res = await authedFetch(`/api/tables/${code}/payer`, { participantId }, "PATCH");
    if (!res) toast.error("Couldn't update who paid.");
    refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-24 sm:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          You are: <strong className="text-foreground">{me?.displayName ?? "…"}</strong>
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <button className="link-affordance text-muted-foreground" onClick={() => setEditHeadcountOpen(true)}>
            Edit expected headcount
          </button>
          <button className="link-affordance text-muted-foreground" onClick={() => setEditPayerOpen(true)}>
            Edit who paid ({paidByName})
          </button>
        </div>
      </div>

      {/* Item cards styled like receipt line items — claimed state uses a
          filled background + checkmark, not just a border color (Part 2). */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {table.items.map((item) => {
          const mine = identity && item.claims.some((c) => c.participantId === identity.participantId);
          return (
            <div
              key={item.id}
              className={`flex min-h-[44px] items-start justify-between gap-2 rounded-lg border p-3 text-sm transition-colors ${
                mine ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <button
                onClick={() => toggleClaim(item.id)}
                className="flex flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    mine ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                  }`}
                  aria-hidden
                >
                  {mine && <Check className="size-3.5" />}
                </span>
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.name} × {item.quantity}
                    {item.lowConfidence && (
                      <Badge variant="outline" className="text-amber-600">
                        needs check
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.claims.length > 0
                      ? item.claims.map((c) => nameOf(c.participantId)).join(", ")
                      : "Unclaimed — tap to claim"}
                  </span>
                </span>
              </button>
              <div className="flex flex-col items-end gap-1">
                <span className="font-medium tabular-nums">₹{(item.price * item.quantity).toFixed(2)}</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => setEditingItem(item)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {item.lowConfidence && (
                    <Button variant="ghost" size="sm" onClick={() => confirmItemLooksRight(item)}>
                      Looks right
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {table.items.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            <ReceiptText className="size-8 opacity-50" />
            <p>No items yet — add anything the receipt missed below.</p>
          </div>
        )}
      </div>

      {/* Add missed item — labeled fields (3.2) with numeric-safe price input
          (3.1): raw string state, select-on-focus, inputMode="decimal". */}
      <div className="rounded-lg border p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Plus className="size-4" /> Add missed item
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-item-name">Item name</Label>
            <Input
              id="new-item-name"
              placeholder="e.g. Garlic bread"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:w-28">
            <Label htmlFor="new-item-price">Price</Label>
            <Input
              id="new-item-price"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={newItemPrice}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*\.?\d*$/.test(v)) setNewItemPrice(v.replace(/^0+(?=\d)/, ""));
              }}
            />
          </div>
          <Button onClick={addItem} disabled={!newItemName || !newItemPrice} className="gap-1.5">
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>

      {/* Bottom-anchored primary action on mobile so it's always reachable
          without scrolling (4.2). */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Button
            className="flex-1 sm:flex-none"
            disabled={!identity || me?.hasSaved}
            onClick={saveOrder}
          >
            {me?.hasSaved ? (
              <>
                <Check className="size-4" /> Order saved
              </>
            ) : (
              "Save my order"
            )}
          </Button>
          {!me?.hasSaved && (
            <Button variant="ghost" onClick={saveOrder} className="hidden sm:inline-flex">
              Nothing to claim
            </Button>
          )}
        </div>
      </div>

      {me && !me.userId && sessionStatus !== "authenticated" && identity && (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="mb-2 flex items-center gap-1.5 font-medium">
            <Users2 className="size-4" /> Sign up to track your balance automatically, next time too.
          </p>
          <Button
            size="sm"
            nativeButton={false}
            render={
              <a
                href={`/signup?mergeTable=${code}&mergeParticipant=${identity.participantId}&mergeToken=${identity.guestToken}`}
              />
            }
          >
            Sign up
          </Button>
        </div>
      )}
      {me && !me.userId && sessionStatus === "authenticated" && identity && (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="mb-2">
            You&apos;re logged in as {session?.user?.name ?? session?.user?.email} — link this
            Table to your account to include it in your balances.
          </p>
          <Button
            size="sm"
            onClick={async () => {
              await authedFetch(`/api/tables/${code}/participants/${identity.participantId}/merge`);
              router.refresh();
              window.location.reload();
            }}
          >
            Link account
          </Button>
        </div>
      )}

      <EditItemDialog
        key={`edit-item-${editingItem?.id ?? "closed"}`}
        item={editingItem}
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSave={(patch) => {
          if (editingItem) return saveEditedItem(editingItem, patch);
        }}
      />
      <EditPayerDialog
        participants={table.participants}
        currentPayerId={table.paidByParticipantId}
        open={editPayerOpen}
        onOpenChange={setEditPayerOpen}
        onSave={updatePayer}
      />
      <EditHeadcountDialog
        key={`headcount-${editHeadcountOpen ? "open" : "closed"}`}
        current={table.expectedParticipants}
        open={editHeadcountOpen}
        onOpenChange={setEditHeadcountOpen}
        onSave={updateExpectedCount}
      />
    </div>
  );
}
