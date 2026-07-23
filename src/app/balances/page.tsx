import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Persistent pairwise balances across every Table the user has been in
 * (project-plan.md §2 feature 7). Only *unsettled* settlements count toward
 * the running total — once either side marks a settlement paid, it drops out.
 *
 * Balances against other logged-in users are grouped by their stable userId
 * (so they aggregate correctly across bills). Balances against guests who
 * never created an account are grouped by display name instead and flagged
 * as approximate, since two different guests could reuse the same name
 * across different Tables.
 */
export default async function BalancesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/balances");
  }
  const myId = session.user.id;

  const settlements = await prisma.settlement.findMany({
    where: {
      settled: false,
      viewMode: "SIMPLIFIED",
      OR: [{ from: { userId: myId } }, { to: { userId: myId } }],
    },
    include: {
      from: { include: { user: true } },
      to: { include: { user: true } },
      bill: true,
    },
  });

  type Row = { key: string; name: string; net: number; approximate: boolean };
  const byKey = new Map<string, Row>();

  for (const s of settlements) {
    const iAmFrom = s.from.userId === myId;
    const other = iAmFrom ? s.to : s.from;
    const key = other.userId ? `user:${other.userId}` : `guest:${other.displayName}`;
    const signedAmount = iAmFrom ? -s.amount : s.amount; // negative = I owe, positive = owed to me
    const existing = byKey.get(key);
    if (existing) {
      existing.net += signedAmount;
    } else {
      byKey.set(key, {
        key,
        name: other.userId ? other.user?.name ?? other.displayName : other.displayName,
        net: signedAmount,
        approximate: !other.userId,
      });
    }
  }

  const rows = [...byKey.values()]
    .filter((r) => Math.abs(r.net) > 0.005)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const totalNet = rows.reduce((sum, r) => sum + r.net, 0);
  const youOwe = rows.filter((r) => r.net < 0).reduce((sum, r) => sum + Math.abs(r.net), 0);
  const owedToYou = rows.filter((r) => r.net > 0).reduce((sum, r) => sum + r.net, 0);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your balances</h1>
        <p className="text-sm text-muted-foreground">
          Across every Table you&apos;ve settled, not yet marked paid.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-owed/15 text-owed">
              <Scale className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium">All settled up!</p>
              <p className="text-sm text-muted-foreground">
                Nothing outstanding right now.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary strip: quick at-a-glance totals before the itemized list. */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <Card size="sm">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <ArrowDownLeft className="size-4 text-owed" />
                <span className="text-lg font-semibold tabular-nums text-owed">
                  ${owedToYou.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">Owed to you</span>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <ArrowUpRight className="size-4 text-owe" />
                <span className="text-lg font-semibold tabular-nums text-owe">
                  ${youOwe.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">You owe</span>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <Wallet className="size-4 text-primary" />
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    totalNet >= 0 ? "text-owed" : "text-owe"
                  }`}
                >
                  {totalNet >= 0 ? "+" : "-"}${Math.abs(totalNet).toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">Net overall</span>
              </CardContent>
            </Card>
          </div>

          <ul className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <li key={r.key}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                          r.net > 0 ? "bg-owed/15 text-owed" : "bg-owe/15 text-owe"
                        }`}
                      >
                        {r.net > 0 ? (
                          <ArrowDownLeft className="size-4" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </span>
                      <span className="font-medium">
                        {r.name}
                        {r.approximate && (
                          <Badge variant="outline" className="ml-1.5 text-muted-foreground">
                            guest, approx.
                          </Badge>
                        )}
                      </span>
                    </div>
                    <span
                      className={`font-semibold tabular-nums ${
                        r.net > 0 ? "text-owed" : "text-owe"
                      }`}
                    >
                      {r.net > 0
                        ? `owes you $${r.net.toFixed(2)}`
                        : `you owe $${Math.abs(r.net).toFixed(2)}`}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
