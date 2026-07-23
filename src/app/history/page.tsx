import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Receipt, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  // Group Tables under a date subheading (by createdAt day) so a busy
  // history reads like a timeline rather than one long flat list.
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const groups = new Map<string, typeof bills>();
  for (const p of bills) {
    const key = dateFormatter.format(new Date(p.bill.createdAt));
    const existing = groups.get(key);
    if (existing) {
      existing.push(p);
    } else {
      groups.set(key, [p]);
    }
  }

  const openCount = bills.filter((p) => p.bill.status !== "CLOSED").length;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your bill history</h1>
        <p className="text-sm text-muted-foreground">
          {bills.length === 0
            ? "Every Table you create or join will show up here."
            : `${bills.length} Table${bills.length === 1 ? "" : "s"} total${
                openCount > 0 ? ` · ${openCount} still open` : ""
              }`}
        </p>
      </div>

      {bills.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Receipt className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium">No Tables yet</p>
              <p className="text-sm text-muted-foreground">
                Start one, or join with a code from the homepage.
              </p>
            </div>
            <Button nativeButton={false} render={<Link href="/new" />}>
              Start a new Table
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups.entries()].map(([dateLabel, group]) => (
            <section key={dateLabel} className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <CalendarDays className="size-4" /> {dateLabel}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.map((p) => (
                  <li key={p.billId}>
                    <Link href={`/table/${p.bill.tableCode}`} className="block">
                      <Card className="transition-colors hover:bg-muted/40">
                        <CardContent className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {p.bill.groupLabel || `Table ${p.bill.tableCode}`}
                              </span>
                              <Badge variant={p.bill.status === "CLOSED" ? "secondary" : "default"}>
                                {p.bill.status === "CLOSED" ? "Closed" : "Open"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="font-mono tracking-wider">{p.bill.tableCode}</span>
                              <span className="flex items-center gap-1">
                                <Users className="size-3" />
                                {p.bill.participants.length}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
