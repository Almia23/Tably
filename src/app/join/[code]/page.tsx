"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { saveGuestIdentity } from "@/lib/guestIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold tracking-tight">
        Join <span className="table-code-badge">{code}</span>
      </h1>
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
    </div>
  );
}
