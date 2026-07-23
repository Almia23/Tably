"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Participant, Payment } from "@/types/table";

type Row = { checked: boolean; amount: string };

/**
 * Who Paid — now supports multiple payers (e.g. two cards split the bill),
 * which is what lets the "Individual" settlement view meaningfully differ
 * from "Simplified": each consumer ends up owing every payer their
 * proportional share, instead of there being just one creditor. A live
 * running total vs. the bill's grand total is shown as a guide, but isn't
 * blocking here — items can still change while the Table's open; the exact
 * match is only enforced when actually closing the Tab.
 */
export function EditPayerDialog({
  participants,
  currentPayments,
  legacyPayerId,
  grandTotal,
  open,
  onOpenChange,
  onSave,
}: {
  participants: Participant[];
  currentPayments: Payment[];
  legacyPayerId: string | null;
  grandTotal: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payments: { participantId: string; amount: number }[]) => Promise<void> | void;
}) {
  const buildInitialRows = () => {
    const rows: Record<string, Row> = {};
    for (const p of participants) rows[p.id] = { checked: false, amount: "" };
    if (currentPayments.length > 0) {
      for (const payment of currentPayments) {
        if (rows[payment.participantId]) {
          rows[payment.participantId] = { checked: true, amount: String(payment.amount) };
        }
      }
    } else if (legacyPayerId && rows[legacyPayerId]) {
      // No Payment rows saved yet (single-payer default from table
      // creation) — pre-check the legacy payer with the full bill total so
      // opening the dialog doesn't look like nobody's marked as paying.
      rows[legacyPayerId] = { checked: true, amount: grandTotal.toFixed(2) };
    }
    return rows;
  };

  const [rows, setRows] = useState<Record<string, Row>>(buildInitialRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkedIds = Object.entries(rows)
    .filter(([, r]) => r.checked)
    .map(([id]) => id);
  const runningTotal = checkedIds.reduce((sum, id) => sum + (Number(rows[id]?.amount) || 0), 0);
  const diff = Math.round((grandTotal - runningTotal) * 100) / 100;

  function toggle(id: string) {
    setRows((prev) => {
      const next = { ...prev, [id]: { ...prev[id], checked: !prev[id].checked } };
      // Convenience: checking the only selected row defaults its amount to
      // the full bill total so single-payer bills need zero typing.
      const nowChecked = Object.entries(next).filter(([, r]) => r.checked);
      if (nowChecked.length === 1 && !next[id].amount) {
        next[id] = { ...next[id], amount: grandTotal.toFixed(2) };
      }
      return next;
    });
  }

  function setAmount(id: string, value: string) {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], amount: value.replace(/^0+(?=\d)/, "") } }));
  }

  function fillRemaining(id: string) {
    const others = checkedIds.filter((cid) => cid !== id);
    const othersTotal = others.reduce((sum, cid) => sum + (Number(rows[cid]?.amount) || 0), 0);
    const remaining = Math.max(0, Math.round((grandTotal - othersTotal) * 100) / 100);
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], amount: remaining.toFixed(2) } }));
  }

  async function handleSave() {
    const payments = checkedIds
      .map((id) => ({ participantId: id, amount: Number(rows[id]?.amount) || 0 }))
      .filter((p) => p.amount > 0);
    if (payments.length === 0) {
      setError("Pick at least one person who paid, with an amount above ₹0.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(payments);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setRows(buildInitialRows());
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who paid?</DialogTitle>
          <DialogDescription>
            Check everyone who put money down up front, and how much each of them paid — more
            than one person can split the payment itself.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Who paid</legend>
          {participants.map((p) => {
            const row = rows[p.id];
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-md border p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <Label htmlFor={`payer-${p.id}`} className="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                  <input
                    id={`payer-${p.id}`}
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={row?.checked ?? false}
                    onChange={() => toggle(p.id)}
                  />
                  {p.displayName}
                </Label>
                {row?.checked && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-20"
                      value={row.amount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setAmount(p.id, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="whitespace-nowrap"
                      onClick={() => fillRemaining(p.id)}
                    >
                      Fill rest
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>

        <p
          className={`text-xs ${Math.abs(diff) < 0.01 ? "text-owed" : "text-muted-foreground"}`}
        >
          {Math.abs(diff) < 0.01
            ? `Matches the bill total (₹${grandTotal.toFixed(2)}).`
            : diff > 0
              ? `₹${diff.toFixed(2)} of the ₹${grandTotal.toFixed(2)} total still unaccounted for.`
              : `₹${Math.abs(diff).toFixed(2)} over the ₹${grandTotal.toFixed(2)} total.`}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
