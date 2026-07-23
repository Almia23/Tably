"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 text-center dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight">🍽️ Tably</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        LLM-powered, real-time bill splitting. Upload a receipt, everyone taps
        what they had, and Tably works out who owes whom.
      </p>
      <Link
        href="/new"
        className="rounded bg-black px-6 py-3 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Start a new Table
      </Link>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/join/${code.trim().toUpperCase()}`);
        }}
      >
        <input
          className="rounded border border-zinc-300 px-3 py-2 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Table code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={4}
        />
        <button className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700" type="submit">
          Join
        </button>
      </form>
    </div>
  );
}
