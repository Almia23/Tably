import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";
import { verifyParticipant } from "@/lib/verifyParticipant";

const ToggleClaimSchema = z.object({
  participantId: z.string(),
  guestToken: z.string().optional(),
  itemId: z.string(),
});

/**
 * Toggle a participant's claim on an item (project-plan.md §2 feature 4).
 *
 * Simultaneous claims on the same item are silently allowed and the item
 * auto-converts to shared (§9 Flow 3, explicit decision) — if a second
 * participant taps an item someone else already claimed, both keep it,
 * split evenly, and the Ledger is told so it's not invisible.
 *
 * Editing after save is allowed until the Table closes (§9 Flow 3) — this
 * route doesn't check `hasSaved`, so re-toggling always works while OPEN.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const json = await req.json().catch(() => null);
  const parsed = ToggleClaimSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { participantId, guestToken, itemId } = parsed.data;

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json({ error: "This Table is closed." }, { status: 409 });
  }

  const participant = await verifyParticipant(bill.id, participantId, guestToken);
  if (!participant) {
    return NextResponse.json({ error: "Not recognized on this Table" }, { status: 403 });
  }

  const item = await prisma.billItem.findUnique({
    where: { id: itemId },
    include: { claims: true },
  });
  if (!item || item.billId !== bill.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const alreadyClaimed = item.claims.some((c) => c.participantId === participantId);
  const wasShared = item.claims.length > 1;

  await prisma.$transaction(async (tx) => {
    if (alreadyClaimed) {
      await tx.claim.delete({
        where: { itemId_participantId: { itemId, participantId } },
      });
    } else {
      await tx.claim.create({
        data: { itemId, participantId, shareFraction: 1 }, // rebalanced below
      });
    }

    const remaining = await tx.claim.findMany({ where: { itemId } });
    const shareFraction = remaining.length > 0 ? 1 / remaining.length : 1;
    for (const claim of remaining) {
      await tx.claim.update({
        where: { id: claim.id },
        data: { shareFraction },
      });
    }

    await logAudit({
      billId: bill.id,
      participantId,
      actionType: alreadyClaimed ? "CLAIM_EDITED" : "CLAIM_SAVED",
      targetId: itemId,
      details: { action: alreadyClaimed ? "unclaim" : "claim" },
      tx,
    });

    if (!wasShared && remaining.length > 1) {
      await logAudit({
        billId: bill.id,
        actionType: "ITEM_BECAME_SHARED",
        targetId: itemId,
        details: { participantIds: remaining.map((c) => c.participantId) },
        tx,
      });
    }
  });

  const updatedItem = await prisma.billItem.findUnique({
    where: { id: itemId },
    include: { claims: true },
  });

  await broadcast(bill.tableCode, "claim-updated", {
    itemId,
    claims: updatedItem?.claims ?? [],
  });

  return NextResponse.json({ item: updatedItem });
}
