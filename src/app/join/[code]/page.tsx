"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { saveGuestIdentity } from "@/lib/guestIdentity";

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
        setTimeout(() => router.push(`/table/${code}`), 1200);
      } else {
        router.push(`/table/${code}`);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Join Table {code}</h1>
      <label className="flex flex-col text-sm">
        Your name
        <input
          className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name && handleJoin()}
          placeholder="e.g. Rahul"
          autoFocus
        />
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {renamedTo && (
        <p className="text-sm text-amber-600">
          Someone else already joined as that name — you&apos;re in as{" "}
          <strong>{renamedTo}</strong>.
        </p>
      )}
      <button
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        disabled={!name || isJoining}
        onClick={handleJoin}
      >
        {isJoining ? "Joining…" : "Join"}
      </button>
    </div>
  );
}
