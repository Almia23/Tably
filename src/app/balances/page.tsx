import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Your balances</h1>
      <p className="mb-6 text-sm text-black/60 dark:text-white/60">
        Across every Table you&apos;ve settled, not yet marked paid.
      </p>

      {rows.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          All settled up! Nothing outstanding right now.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.key}
                className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
              >
                <span>
                  {r.name}
                  {r.approximate && (
                    <span className="ml-1 text-xs text-black/40 dark:text-white/40">
                      (guest, approximate)
                    </span>
                  )}
                </span>
                <span
                  className={
                    r.net > 0
                      ? "font-medium text-green-700 dark:text-green-400"
                      : "font-medium text-red-600 dark:text-red-400"
                  }
                >
                  {r.net > 0
                    ? `owes you $${r.net.toFixed(2)}`
                    : `you owe $${Math.abs(r.net).toFixed(2)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            Net overall:{" "}
            <span className="font-medium">
              {totalNet >= 0
                ? `you're owed $${totalNet.toFixed(2)}`
                : `you owe $${Math.abs(totalNet).toFixed(2)}`}
            </span>
          </p>
        </>
      )}
    </main>
  );
}
