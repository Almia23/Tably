import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";
import { verifyParticipant } from "@/lib/verifyParticipant";

const AddItemSchema = z.object({
  participantId: z.string(),
  guestToken: z.string().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive().default(1),
});

/**
 * Add Missed Item (project-plan.md §2 feature 13): any participant can add
 * an item the LLM missed or that wasn't on the receipt (e.g. a cash add-on).
 * It immediately becomes claimable like any other item.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const json = await req.json().catch(() => null);
  const parsed = AddItemSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { participantId, guestToken, name, price, quantity } = parsed.data;

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json({ error: "This Table is closed." }, { status: 409 });
  }

  const participant = await verifyParticipant(bill.id, participantId, guestToken);
  if (!participant) {
    return NextResponse.json({ error: "Not recognized on this Table" }, { status: 403 });
  }

  const item = await prisma.billItem.create({
    data: {
      billId: bill.id,
      name,
      price,
      quantity,
      addedByParticipantId: participantId,
    },
  });

  await logAudit({
    billId: bill.id,
    participantId,
    actionType: "ITEM_ADDED",
    targetId: item.id,
    details: { name, price, quantity },
  });

  await broadcast(bill.tableCode, "item-added", { item: { ...item, claims: [] } });

  return NextResponse.json({ item }, { status: 201 });
}
