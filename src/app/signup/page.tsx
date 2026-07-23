"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Optional guest-merge context, passed from the "sign up to keep this
  // balance" nudge on a just-closed Table page.
  const mergeTable = params.get("mergeTable");
  const mergeParticipant = params.get("mergeParticipant");
  const mergeToken = params.get("mergeToken");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const signupRes = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!signupRes.ok) {
      const data = await signupRes.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", { email, password, redirect: false });
    if (signInRes?.error) {
      setError("Account created, but automatic login failed — please log in.");
      setLoading(false);
      router.push("/login");
      return;
    }

    // If they arrived here from a "sign up to keep this balance" nudge,
    // link their new account to the guest participant they already are.
    if (mergeTable && mergeParticipant && mergeToken) {
      await fetch(`/api/tables/${mergeTable}/participants/${mergeParticipant}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestToken: mergeToken }),
      }).catch(() => {});
      router.push(`/table/${mergeTable}`);
    } else {
      router.push("/history");
    }
    router.refresh();
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 size-72 -translate-x-1/2 rounded-full bg-owed/20 blur-3xl"
      />
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserPlus className="size-4.5" />
          </span>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>
            {mergeTable
              ? "We'll link this account to your balance from that Table."
              : "Track your balances automatically across every Table."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-name">Name</Label>
              <Input id="signup-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? "Creating account…" : "Sign up"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="link-affordance text-foreground">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
