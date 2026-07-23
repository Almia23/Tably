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
import type { Participant } from "@/types/table";

/**
 * Replaces the old prompt()-based "Edit who paid" interaction with a
 * labeled radio-style list of participants (3.2's "upgrade prompt()"
 * suggestion applied consistently across the app).
 */
export function EditPayerDialog({
  participants,
  currentPayerId,
  open,
  onOpenChange,
  onSave,
}: {
  participants: Participant[];
  currentPayerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (participantId: string) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState(currentPayerId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await onSave(selected);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(currentPayerId ?? "");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who paid?</DialogTitle>
          <DialogDescription>Pick whoever paid the bill up front.</DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Who paid</legend>
          {participants.map((p) => (
            <Label
              key={p.id}
              htmlFor={`payer-${p.id}`}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 font-normal has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                id={`payer-${p.id}`}
                type="radio"
                name="payer"
                className="size-4 accent-primary"
                checked={selected === p.id}
                onChange={() => setSelected(p.id)}
              />
              {p.displayName}
            </Label>
          ))}
        </fieldset>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selected || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
