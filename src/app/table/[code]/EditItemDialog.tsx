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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Item } from "@/types/table";

/**
 * Replaces the old prompt()-based "Edit item" interaction (3.2) with a real
 * labeled form in a modal (desktop) / uses shadcn's Dialog, which is
 * responsive down to mobile widths by default — a browser prompt() can't
 * have labels at all and can't be styled, so this both fixes the
 * missing-labels bug and the numeric leading-zero bug (3.1) in one upgrade.
 *
 * Callers should render this with `key={item?.id}` so the form remounts
 * (and re-seeds from the current item) each time a different item is
 * opened, instead of syncing props into state via an effect.
 */
export function EditItemDialog({
  item,
  open,
  onOpenChange,
  onSave,
}: {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { name: string; price: number; quantity: number }) => Promise<void> | void;
}) {
  // Numeric fields are kept as raw strings in state (not numbers) so a
  // leading zero isn't silently re-prepended on every keystroke (3.1) —
  // conversion to Number only happens on save. Seeded once from `item` via
  // a lazy initializer (no effect needed) since the parent remounts this
  // component per item.
  const [name, setName] = useState(() => item?.name ?? "");
  const [price, setPrice] = useState(() => String(item?.price ?? ""));
  const [quantity, setQuantity] = useState(() => String(item?.quantity ?? ""));
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  const priceNum = Number(price);
  const quantityNum = Number(quantity);
  const valid =
    name.trim().length > 0 &&
    !Number.isNaN(priceNum) &&
    priceNum >= 0 &&
    Number.isInteger(quantityNum) &&
    quantityNum >= 1;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), price: priceNum, quantity: quantityNum });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>Correct the name, price, or quantity the LLM parsed.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-item-name">Item name</Label>
            <Input
              id="edit-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-item-price">Price (per unit)</Label>
              <Input
                id="edit-item-price"
                type="text"
                inputMode="decimal"
                value={price}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const v = e.target.value;
                  // Allow only digits and a single decimal point; strip a
                  // leading zero that's followed by another digit so typing
                  // "2" after a defaulted "0" replaces rather than appends.
                  if (/^\d*\.?\d*$/.test(v)) {
                    setPrice(v.replace(/^0+(?=\d)/, ""));
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-item-quantity">Quantity</Label>
              <Input
                id="edit-item-quantity"
                type="text"
                inputMode="numeric"
                value={quantity}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*$/.test(v)) {
                    setQuantity(v.replace(/^0+(?=\d)/, ""));
                  }
                }}
              />
            </div>
          </div>
          {!valid && (name || price || quantity) && (
            <p className="text-xs text-destructive">
              Enter a valid name, a price ≥ 0, and a whole-number quantity ≥ 1.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
