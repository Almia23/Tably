import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/history");
  }

  const participations = await prisma.participant.findMany({
    where: { userId: session.user.id },
    include: {
      bill: {
        include: {
          participants: true,
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  // A user might have joined the same bill more than once historically (e.g.
  // guest + later linked) — de-dupe by bill id, keeping the earliest join.
  const seen = new Set<string>();
  const bills = participations.filter((p) => {
    if (seen.has(p.billId)) return false;
    seen.add(p.billId);
    return true;
  });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Your bill history</h1>
      {bills.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No Tables yet.{" "}
          <Link href="/new" className="underline">
            Start one
          </Link>{" "}
          or join with a code from the homepage.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bills.map((p) => (
            <li key={p.billId}>
              <Link
                href={`/table/${p.bill.tableCode}`}
                className="block rounded-lg border border-black/10 px-4 py-3 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {p.bill.groupLabel || `Table ${p.bill.tableCode}`}
                  </span>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 ${
                      p.bill.status === "CLOSED"
                        ? "bg-black/10 dark:bg-white/10"
                        : "bg-green-500/15 text-green-700 dark:text-green-400"
                    }`}
                  >
                    {p.bill.status === "CLOSED" ? "Closed" : "Open"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-black/50 dark:text-white/50">
                  {p.bill.participants.length} participant
                  {p.bill.participants.length === 1 ? "" : "s"} · Code {p.bill.tableCode} ·{" "}
                  {new Date(p.bill.createdAt).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
