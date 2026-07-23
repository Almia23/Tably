"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export function NavBar() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Tably
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {status === "authenticated" && session?.user ? (
            <>
              <Link href="/history" className="hover:underline">
                History
              </Link>
              <Link href="/balances" className="hover:underline">
                Balances
              </Link>
              <span className="text-black/50 dark:text-white/50">
                {session.user.name ?? session.user.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="hover:underline cursor-pointer"
              >
                Log out
              </button>
            </>
          ) : status === "loading" ? (
            <span className="text-black/40 dark:text-white/40">…</span>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-black px-3 py-1.5 text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
