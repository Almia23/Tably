"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Receipt, Users, Split, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  {
    icon: Receipt,
    title: "Snap the receipt",
    body: "Upload a photo and Tably's LLM parses every item, tax, and tip automatically.",
  },
  {
    icon: Users,
    title: "Everyone taps in",
    body: "Share the Table Code — each person claims what they had, live, from their own phone.",
  },
  {
    icon: Split,
    title: "Tably does the math",
    body: "Shared items split evenly, and a simplified settlement shows exactly who owes whom.",
  },
];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Decorative warm gradient blobs — breaks up the flat background
          without competing with the receipt-paper card surfaces (Part 2). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/25 blur-3xl sm:size-96"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-24 size-64 rounded-full bg-owed/20 blur-3xl sm:size-80"
      />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-16 px-4 py-16 text-center sm:py-24">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6">
          <span className="table-code-badge">
            <Sparkles className="size-4" /> LLM-powered splitting
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            🍽️ Tably
          </h1>
          <p className="max-w-lg text-balance text-base text-muted-foreground sm:text-lg">
            Upload a receipt, everyone taps what they had, and Tably works out
            who owes whom — live, no spreadsheets.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="gap-2"
              nativeButton={false}
              render={<Link href="/new" />}
            >
              Start a new Table <ArrowRight className="size-4" />
            </Button>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) router.push(`/join/${code.trim().toUpperCase()}`);
              }}
            >
              <div className="flex flex-col gap-1.5 text-left">
                <Label htmlFor="join-code" className="sr-only">
                  Table code
                </Label>
                <Input
                  id="join-code"
                  className="w-32 text-center font-mono uppercase tracking-widest"
                  placeholder="CODE"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={4}
                />
              </div>
              <Button type="submit" size="lg" variant="secondary">
                Join
              </Button>
            </form>
          </div>
        </div>

        {/* How it works */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="text-left transition-transform hover:-translate-y-0.5">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <step.icon className="size-4.5" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Step {i + 1}
                  </span>
                </div>
                <h2 className="font-semibold">{step.title}</h2>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
