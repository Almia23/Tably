"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { saveGuestIdentity } from "@/lib/guestIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code.toUpperCase();

  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamedTo, setRenamedTo] = useState<string | null>(null);

  async function handleJoin() {
    setIsJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/tables/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.closed) {
          // Table already closed before they could join — nothing to claim,
          // so send them straight to the Ledger to see the final split.
          router.push(`/table/${code}`);
          return;
        }
        setError(data.error || "Couldn't join this Table.");
        return;
      }

      saveGuestIdentity(code, {
        participantId: data.participantId,
        guestToken: data.guestToken,
        displayName: data.displayName,
      });

      if (data.renamed) {
        setRenamedTo(data.displayName);
        setTimeout(() => router.push(`/table/${code}/order`), 1200);
      } else {
        router.push(`/table/${code}/order`);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -left-20 size-64 rounded-full bg-owed/15 blur-3xl"
      />
      <Card className="relative w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UtensilsCrossed className="size-5" />
          </span>
          <CardTitle className="text-2xl">
            Join <span className="table-code-badge align-middle">{code}</span>
          </CardTitle>
          <CardDescription>
            Add your name so everyone can see what you claimed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join-name">Your name</Label>
            <Input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name && handleJoin()}
              placeholder="e.g. Rahul"
              autoFocus
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {renamedTo && (
            <Alert>
              <AlertDescription>
                Someone else already joined as that name — you&apos;re in as{" "}
                <strong>{renamedTo}</strong>.
              </AlertDescription>
            </Alert>
          )}
          <Button disabled={!name || isJoining} onClick={handleJoin}>
            {isJoining ? "Joining…" : "Join"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
