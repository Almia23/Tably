import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";
import { verifyParticipant } from "@/lib/verifyParticipant";
import { toTitleCase } from "@/lib/textCase";

const EditItemSchema = z.object({
  participantId: z.string(),
  guestToken: z.string().optional(),
  name: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
  quantity: z.number().int().positive().optional(),
});

/**
 * Manual Correction (project-plan.md §2 feature 5): any participant can fix
 * a misparsed item (wrong price, merged items, etc.) before/during claiming.
 * Last-write-wins for MVP; every edit is still logged to the Ledger so the
 * correction history is visible even though only the final value is kept
 * (§9 Flow 4 — a deliberate, documented simplification).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; itemId: string }> },
) {
  const { code, itemId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = EditItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { participantId, guestToken, ...patch } = parsed.data;

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json({ error: "This Table is closed." }, { status: 409 });
  }

  const participant = await verifyParticipant(bill.id, participantId, guestToken);
  if (!participant) {
    return NextResponse.json({ error: "Not recognized on this Table" }, { status: 403 });
  }

  const existing = await prisma.billItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.billId !== bill.id) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const updated = await prisma.billItem.update({
    where: { id: itemId },
    data: { ...patch, name: patch.name ? toTitleCase(patch.name) : undefined, lowConfidence: false }, // a manual edit resolves any low-confidence flag
  });

  await logAudit({
    billId: bill.id,
    participantId,
    actionType: "ITEM_EDITED",
    targetId: itemId,
    details: { before: existing, after: patch },
  });

  if (existing.lowConfidence) {
    await logAudit({
      billId: bill.id,
      participantId,
      actionType: "CLARIFICATION_RESOLVED",
      targetId: itemId,
      details: { name: updated.name },
    });
  }

  await broadcast(bill.tableCode, "item-edited", { item: updated });

  return NextResponse.json({ item: updated });
}
