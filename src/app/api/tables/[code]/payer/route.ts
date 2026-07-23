import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";

const PayerSchema = z.object({ participantId: z.string() });

/**
 * Who Paid (project-plan.md §2 feature 7) — editable after the fact, since
 * the wrong payer getting marked "will happen" (§9 Flow 6). Only allowed
 * while the Table is still OPEN; once closed, settlements are already
 * computed against the recorded payer (reopening recomputes them).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const json = await req.json().catch(() => null);
  const parsed = PayerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json(
      { error: "Reopen the Tab to change who paid." },
      { status: 409 },
    );
  }

  const participant = await prisma.participant.findUnique({
    where: { id: parsed.data.participantId },
  });
  if (!participant || participant.billId !== bill.id) {
    return NextResponse.json({ error: "Participant not found on this Table" }, { status: 404 });
  }

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: { paidByParticipantId: participant.id },
  });

  await logAudit({
    billId: bill.id,
    actionType: "PAYER_CHANGED",
    details: { paidByParticipantId: participant.id, displayName: participant.displayName },
  });

  await broadcast(bill.tableCode, "payer-changed", {
    paidByParticipantId: updated.paidByParticipantId,
  });

  return NextResponse.json({ paidByParticipantId: updated.paidByParticipantId });
}
