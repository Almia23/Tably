import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";

const CountSchema = z.object({ expectedParticipants: z.number().int().min(1) });

/**
 * Editable participant count (project-plan.md §2 feature 16). Reducing below
 * the number already joined is blocked; increasing it reopens joining if the
 * Table had hit capacity — enforced simply by comparing to joined count.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const json = await req.json().catch(() => null);
  const parsed = CountSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bill = await prisma.bill.findUnique({
    where: { tableCode: code.toUpperCase() },
    include: { participants: true },
  });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  if (parsed.data.expectedParticipants < bill.participants.length) {
    return NextResponse.json(
      {
        error: `Can't set expected count below the ${bill.participants.length} people already joined.`,
      },
      { status: 400 },
    );
  }

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: { expectedParticipants: parsed.data.expectedParticipants },
  });

  await logAudit({
    billId: bill.id,
    actionType: "PARTICIPANT_COUNT_CHANGED",
    details: { expectedParticipants: parsed.data.expectedParticipants },
  });

  await broadcast(bill.tableCode, "participant-count-changed", {
    expectedParticipants: updated.expectedParticipants,
  });

  return NextResponse.json({ expectedParticipants: updated.expectedParticipants });
}
