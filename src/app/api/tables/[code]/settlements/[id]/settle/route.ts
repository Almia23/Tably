import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";
import { verifyParticipant } from "@/lib/verifyParticipant";

// participantId/guestToken are optional here (not required to keep the
// route working before this change shipped everywhere), but when present
// they're verified and the actor's name is recorded on the Ledger entry —
// "who marked this settled", not just that it happened.
const SettleSchema = z.object({
  participantId: z.string().optional(),
  guestToken: z.string().optional(),
});

/**
 * Mark-as-settled (project-plan.md §2 feature 9; §9 Flow 6). One-sided for
 * MVP — either party can mark it settled unilaterally, no confirmation step.
 * A deliberate trust-vs-friction tradeoff, not an oversight (two-step
 * confirmation is flagged as future work).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = SettleSchema.safeParse(json);
  const { participantId, guestToken } = parsed.success ? parsed.data : {};

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const settlement = await prisma.settlement.findUnique({ where: { id } });
  if (!settlement || settlement.billId !== bill.id) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  const actor = await verifyParticipant(bill.id, participantId, guestToken);

  const updated = await prisma.settlement.update({
    where: { id },
    data: { settled: true, settledAt: new Date() },
  });

  await logAudit({
    billId: bill.id,
    participantId: actor?.id ?? null,
    actionType: "SETTLEMENT_MARKED_PAID",
    targetId: id,
    details: { amount: settlement.amount, displayName: actor?.displayName },
  });

  await broadcast(bill.tableCode, "settlement-marked-paid", { id: updated.id });

  return NextResponse.json({ settlement: updated });
}
