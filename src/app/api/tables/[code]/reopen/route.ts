import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";

/**
 * Reopen Tab (project-plan.md §9 Flow 5): mistakes get found after the fact
 * (someone forgot an item). Reopening avoids forcing a whole new Table, and
 * the reopen itself is logged in the Ledger for auditability.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "OPEN") {
    return NextResponse.json({ error: "This Table is already open." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: "OPEN", closedAt: null },
    });
    await tx.settlement.deleteMany({ where: { billId: bill.id } });
    await logAudit({ billId: bill.id, actionType: "TAB_REOPENED", tx });
  });

  await broadcast(bill.tableCode, "tab-reopened", {});

  return NextResponse.json({ status: "OPEN" });
}
