"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

export function NavBar() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="link-affordance font-semibold tracking-tight text-foreground">
          🍽️ Tably
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {status === "authenticated" && session?.user ? (
            <>
              <Link href="/history" className="link-affordance hidden sm:inline">
                History
              </Link>
              <Link href="/balances" className="link-affordance hidden sm:inline">
                Balances
              </Link>
              <span className="hidden text-muted-foreground sm:inline">
                {session.user.name ?? session.user.email}
              </span>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="link-affordance">
                Log out
              </button>
            </>
          ) : status === "loading" ? (
            <span className="text-muted-foreground">…</span>
          ) : (
            <>
              <Link href="/login" className="link-affordance">
                Log in
              </Link>
              <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
                Sign up
              </Button>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

