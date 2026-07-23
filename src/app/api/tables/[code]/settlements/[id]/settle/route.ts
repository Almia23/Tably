import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";

/**
 * Mark-as-settled (project-plan.md §2 feature 9; §9 Flow 6). One-sided for
 * MVP — either party can mark it settled unilaterally, no confirmation step.
 * A deliberate trust-vs-friction tradeoff, not an oversight (two-step
 * confirmation is flagged as future work).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const settlement = await prisma.settlement.findUnique({ where: { id } });
  if (!settlement || settlement.billId !== bill.id) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  const updated = await prisma.settlement.update({
    where: { id },
    data: { settled: true, settledAt: new Date() },
  });

  await logAudit({
    billId: bill.id,
    actionType: "SETTLEMENT_MARKED_PAID",
    targetId: id,
    details: { amount: settlement.amount },
  });

  await broadcast(bill.tableCode, "settlement-marked-paid", { id: updated.id });

  return NextResponse.json({ settlement: updated });
}
