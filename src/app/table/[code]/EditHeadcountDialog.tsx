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

/**
 * Replaces the prompt()-based headcount editor with a labeled numeric field
 * (3.1 + 3.2): state starts as an empty string, not 0, and the field is
 * select-on-focus so a keystroke replaces rather than appends to any
 * existing value. Callers should render with `key={open}` so the field
 * re-seeds from `current` each time it's reopened, instead of syncing via
 * an effect.
 */
export function EditHeadcountDialog({
  current,
  open,
  onOpenChange,
  onSave,
}: {
  current: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (n: number) => Promise<void> | void;
}) {
  const [value, setValue] = useState(() => String(current));
  const [saving, setSaving] = useState(false);

  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n > 0;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave(n);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update expected headcount</DialogTitle>
          <DialogDescription>You can change this later if more or fewer people show up.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expected-headcount">Expected participants</Label>
          <Input
            id="expected-headcount"
            type="text"
            inputMode="numeric"
            value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*$/.test(v)) setValue(v.replace(/^0+(?=\d)/, ""));
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
