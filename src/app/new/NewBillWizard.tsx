"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { saveGuestIdentity } from "@/lib/guestIdentity";

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
  const [fellBackToManual, setFellBackToManual] = useState(false);
  const [rawLlmOutput, setRawLlmOutput] = useState<unknown>(null);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [taxAmount, setTaxAmount] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
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

  async function handleFileUpload(file: File) {
    setIsParsing(true);
    setParseError(null);
    setFellBackToManual(false);

    try {
      const imageDataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const data = await res.json();

      if (data.fallback || !data.parsed) {
        setFellBackToManual(true);
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
        setTaxAmount(data.parsed.taxAmount ?? 0);
        setTipAmount(data.parsed.tipAmount ?? 0);
      }
      setStep(2);
    } catch (err) {
      console.error(err);
      // Never dead-end the user — fall back to manual entry (project-plan.md §6).
      setParseError("Couldn't reach the parser. Falling back to manual entry.");
      setFellBackToManual(true);
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
          tipAmount,
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Start a new Table</h1>

      {step === 1 && (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Upload a photo of the receipt. We&apos;ll parse it automatically —
            if that fails, you can enter items by hand instead.
          </p>
          <input
            type="file"
            accept="image/*"
            disabled={isParsing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="text-sm"
          />
          {isParsing && <p className="text-sm text-zinc-500">Parsing receipt…</p>}
          {parseError && <p className="text-sm text-amber-600">{parseError}</p>}
          <button
            className="self-start text-sm underline text-zinc-500"
            onClick={() => {
              setItems([blankItem()]);
              setFellBackToManual(true);
              setStep(2);
            }}
          >
            Skip upload, enter items manually
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          {fellBackToManual && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Parsing wasn&apos;t available — enter items manually below.
            </p>
          )}
          <h2 className="font-semibold">Review items</h2>
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2">
                <input
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="Item name"
                  value={it.name}
                  onChange={(e) => updateItem(it.id, { name: e.target.value })}
                />
                <input
                  type="number"
                  className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="Price"
                  value={it.price}
                  onChange={(e) => updateItem(it.id, { price: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                />
                {it.lowConfidence && (
                  <span title="LLM was unsure about this item" className="text-amber-500">
                    ⚠️
                  </span>
                )}
                <button className="text-sm text-red-500" onClick={() => removeItem(it.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            className="self-start text-sm underline text-zinc-500"
            onClick={() => setItems((prev) => [...prev, blankItem()])}
          >
            + Add missed item
          </button>

          <div className="flex gap-4">
            <label className="flex flex-col text-sm">
              Tax
              <input
                type="number"
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                value={taxAmount}
                onChange={(e) => setTaxAmount(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col text-sm">
              Tip
              <input
                type="number"
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                value={tipAmount}
                onChange={(e) => setTipAmount(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col text-sm">
              Split tax/tip
              <select
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                value={taxTipSplit}
                onChange={(e) => setTaxTipSplit(e.target.value as "EVEN" | "PROPORTIONAL")}
              >
                <option value="EVEN">Evenly</option>
                <option value="PROPORTIONAL">Proportional to order</option>
              </select>
            </label>
          </div>

          <button
            className="self-end rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            disabled={items.length === 0 || items.some((i) => !i.name || i.price <= 0)}
            onClick={() => setStep(3)}
          >
            Next: Set up the Table
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-semibold">Set up the Table</h2>
          <label className="flex flex-col text-sm">
            Your name
            <input
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={effectiveCreatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="e.g. Priya"
            />
          </label>
          <label className="flex flex-col text-sm">
            How many people (including you)?
            <input
              type="number"
              min={1}
              className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={expectedParticipants}
              onChange={(e) => setExpectedParticipants(Number(e.target.value))}
            />
          </label>
          <p className="text-xs text-zinc-500">
            You can change this later if someone extra shows up or drops — it&apos;s
            always editable from the Table page.
          </p>
          <label className="flex flex-col text-sm">
            Group label <span className="text-zinc-400">(optional, e.g. &quot;Goa trip&quot;)</span>
            <input
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              placeholder="Just cosmetic — shows up in history"
            />
          </label>
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
          <button
            className="self-end rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            disabled={isSubmitting || !effectiveCreatorName || expectedParticipants < 1}
            onClick={handleSubmit}
          >
            {isSubmitting ? "Creating…" : "Create Table"}
          </button>
        </div>
      )}
    </div>
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
