"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Camera, Check, Loader2, Plus, Receipt, Users, X } from "lucide-react";
import { saveGuestIdentity } from "@/lib/guestIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type DraftItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  lowConfidence: boolean;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function blankItem(): DraftItem {
  return { id: uid(), name: "", price: 0, quantity: 1, lowConfidence: false };
}

const STEP_LABELS = ["Upload", "Review", "Set up"] as const;

/**
 * Table creation wizard (project-plan.md §2 features 1, 2, 11, 16). Only the
 * creator interacts with this — everyone else joins the live Table via its
 * code and claims their own items on the Claim page (Phase 2), rather than
 * one admin tagging on everyone's behalf (that was the Phase 1 pipeline).
 */
export default function NewBillWizard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawLlmOutput, setRawLlmOutput] = useState<unknown>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [items, setItems] = useState<DraftItem[]>([]);
  // Tax and tip are combined into a single "Tax & tip" figure in the UI —
  // still stored server-side as taxAmount, with tipAmount always 0, so no
  // schema/API changes are required to support the simplified workflow.
  const [taxAmount, setTaxAmount] = useState(0);
  const [taxTipSplit, setTaxTipSplit] = useState<"EVEN" | "PROPORTIONAL">("EVEN");

  const [creatorName, setCreatorName] = useState("");
  const [expectedParticipants, setExpectedParticipants] = useState(2);
  const [groupLabel, setGroupLabel] = useState("");
  // Pre-fill the creator's name from their account (once loaded) without
  // overwriting anything the user has already typed — computed at render
  // time instead of via a setState-in-effect.
  const effectiveCreatorName = creatorName || session?.user?.name || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const itemsTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const grandTotal = itemsTotal + taxAmount;

  async function handleFileUpload(file: File) {
    setIsParsing(true);
    setParseError(null);

    try {
      const imageDataUrl = await fileToDataUrl(file);
      setImagePreview(imageDataUrl);
      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const data = await res.json();

      if (data.fallback || !data.parsed) {
        setItems([blankItem()]);
      } else {
        setRawLlmOutput(data.parsed);
        setItems(
          data.parsed.items.map(
            (it: { name: string; price: number; quantity: number; lowConfidence: boolean }) => ({
              id: uid(),
              name: it.name,
              price: it.price,
              quantity: it.quantity ?? 1,
              lowConfidence: Boolean(it.lowConfidence),
            }),
          ),
        );
        setTaxAmount((data.parsed.taxAmount ?? 0) + (data.parsed.tipAmount ?? 0));
      }
      setStep(2);
    } catch (err) {
      console.error(err);
      // Never dead-end the user — fall back to manual entry (project-plan.md §6).
      setParseError("Couldn't reach the parser. You can still enter items manually below.");
      setItems([blankItem()]);
      setStep(2);
    } finally {
      setIsParsing(false);
    }
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawLlmOutput,
          taxAmount,
          tipAmount: 0,
          taxTipSplit,
          expectedParticipants,
          creatorName: effectiveCreatorName,
          groupLabel: groupLabel.trim() || undefined,
          items: items.map((it) => ({
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            lowConfidence: it.lowConfidence,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create Table");
      }
      const data = await res.json();
      saveGuestIdentity(data.tableCode, {
        participantId: data.participantId,
        guestToken: data.guestToken,
        displayName: data.displayName,
      });
      router.push(`/table/${data.tableCode}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Start a new Table</h1>
        <p className="text-sm text-muted-foreground">
          Snap the receipt, double-check the items, then share the code so
          everyone can claim what they had.
        </p>
      </div>

      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-sm">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                      ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3.5" /> : n}
              </span>
              <span
                className={cn(
                  "hidden font-medium sm:inline",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <span className="h-px flex-1 bg-border" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="size-4.5 text-primary" /> Upload the receipt
            </CardTitle>
            <CardDescription>
              We&apos;ll parse every item, tax, and tip automatically — if that
              fails, you can enter items by hand instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/10",
                isParsing && "pointer-events-none opacity-70",
              )}
            >
              {imagePreview ? (
                <div className="relative h-32 w-24 overflow-hidden rounded-md ring-1 ring-border">
                  <Image
                    src={imagePreview}
                    alt="Receipt preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {isParsing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Receipt className="size-6" />
                </span>
              )}
              <span className="text-sm font-medium">
                {isParsing
                  ? "Parsing receipt…"
                  : imagePreview
                    ? "Uploaded — parsing complete"
                    : "Tap to choose a photo"}
              </span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG, or HEIC — taken straight from your camera works great
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={isParsing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="sr-only"
              />
            </label>

            {parseError && (
              <Alert variant="destructive">
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setItems([blankItem()]);
                setStep(2);
              }}
            >
              <Plus className="size-4" /> Enter items manually
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Review items</CardTitle>
            <CardDescription>
              Fix anything the parser missed, or add items it didn&apos;t
              catch — items flagged{" "}
              <Badge variant="outline" className="text-amber-600">
                needs check
              </Badge>{" "}
              are worth a second look.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {imagePreview && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-2">
                <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded ring-1 ring-border">
                  <Image src={imagePreview} alt="Receipt" fill className="object-cover" unoptimized />
                </div>
                <p className="text-xs text-muted-foreground">
                  Parsed from your upload — double-check prices and quantities below.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 rounded-lg border bg-card p-2"
                >
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <Input
                    className="flex-1"
                    placeholder="Item name"
                    value={it.name}
                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="w-24 tabular-nums"
                    placeholder="Price"
                    value={it.price || ""}
                    onChange={(e) => updateItem(it.id, { price: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    min={1}
                    className="w-16 tabular-nums"
                    placeholder="Qty"
                    value={it.quantity}
                    onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                  />
                  {it.lowConfidence && (
                    <Badge variant="outline" className="shrink-0 text-amber-600">
                      needs check
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(it.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-fit gap-1.5 text-muted-foreground"
              onClick={() => setItems((prev) => [...prev, blankItem()])}
            >
              <Plus className="size-4" /> Add missed item
            </Button>

            <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-tip">Tax &amp; tip</Label>
                <Input
                  id="tax-tip"
                  type="number"
                  value={taxAmount || ""}
                  onChange={(e) => setTaxAmount(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Split tax &amp; tip</Label>
                <Tabs value={taxTipSplit} onValueChange={(v) => setTaxTipSplit(v as "EVEN" | "PROPORTIONAL")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="EVEN" className="flex-1">
                      Evenly
                    </TabsTrigger>
                    <TabsTrigger value="PROPORTIONAL" className="flex-1">
                      Proportional
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="flex justify-between text-muted-foreground">
                <span>Items</span> <span className="tabular-nums">₹{itemsTotal.toFixed(2)}</span>
              </span>
              <span className="flex justify-between text-muted-foreground">
                <span>Tax &amp; tip</span> <span className="tabular-nums">₹{taxAmount.toFixed(2)}</span>
              </span>
              <span className="flex justify-between font-semibold text-foreground">
                <span>Total</span> <span className="tabular-nums">₹{grandTotal.toFixed(2)}</span>
              </span>
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                disabled={items.length === 0 || items.some((i) => !i.name || i.price <= 0)}
                onClick={() => setStep(3)}
              >
                Next: Set up the Table
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4.5 text-primary" /> Set up the Table
            </CardTitle>
            <CardDescription>
              Last step — tell us who&apos;s in and share the code once it&apos;s created.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="creator-name">Your name</Label>
              <Input
                id="creator-name"
                value={effectiveCreatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                placeholder="e.g. Priya"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="participant-count">How many people (including you)?</Label>
              <Input
                id="participant-count"
                type="number"
                min={1}
                className="w-24"
                value={expectedParticipants}
                onChange={(e) => setExpectedParticipants(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                You can change this later if someone extra shows up or drops —
                it&apos;s always editable from the Table page.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="group-label">
                Group label <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="group-label"
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
                placeholder={'e.g. "Goa trip" — just cosmetic, shows up in history'}
              />
            </div>
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                disabled={isSubmitting || !effectiveCreatorName || expectedParticipants < 1}
                onClick={handleSubmit}
                className="gap-2"
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {isSubmitting ? "Creating…" : "Create Table"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
