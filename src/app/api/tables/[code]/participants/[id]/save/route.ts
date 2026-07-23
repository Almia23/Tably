import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";
import { verifyParticipant } from "@/lib/verifyParticipant";

const SaveSchema = z.object({ guestToken: z.string().optional() });

/**
 * Marks a participant as "done" for this Table — either they saved their
 * claims, or they explicitly have "Nothing to claim" (project-plan.md §9
 * Flow 3). Both cases need to register as done, otherwise the app can't
 * distinguish "hasn't started" from "has nothing to add", which would
 * silently block the auto-finalize suggestion forever.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = SaveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json({ error: "This Table is closed." }, { status: 409 });
  }

  const participant = await verifyParticipant(bill.id, id, parsed.data.guestToken);
  if (!participant) {
    return NextResponse.json({ error: "Not recognized on this Table" }, { status: 403 });
  }

  const updated = await prisma.participant.update({
    where: { id },
    data: { hasSaved: true },
  });

  await logAudit({
    billId: bill.id,
    participantId: id,
    actionType: "CLAIM_SAVED",
    details: { displayName: updated.displayName },
  });

  await broadcast(bill.tableCode, "participant-saved", {
    id: updated.id,
    displayName: updated.displayName,
  });

  return NextResponse.json({ participant: updated });
}
