import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";

const PayerSchema = z.object({
  payments: z
    .array(z.object({ participantId: z.string(), amount: z.number().positive() }))
    .min(1),
});

/**
 * Who Paid (project-plan.md §2 feature 7) — editable after the fact, since
 * the wrong payer getting marked "will happen" (§9 Flow 6). Extended to
 * support multiple payers splitting payment itself (e.g. two people each put
 * down a card): the body is now a list of {participantId, amount} rows
 * rather than a single participantId. Only allowed while the Table is still
 * OPEN; once closed, settlements are already computed against the recorded
 * payments (reopening recomputes them). The rows don't need to sum to the
 * current bill total right away — items can still change while the Table is
 * open — that's only enforced when actually closing the Tab (see
 * finalize/route.ts).
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

  const bill = await prisma.bill.findUnique({
    where: { tableCode: code.toUpperCase() },
    include: { participants: true },
  });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json(
      { error: "Reopen the Tab to change who paid." },
      { status: 409 },
    );
  }

  const validIds = new Set(bill.participants.map((p) => p.id));
  const seen = new Set<string>();
  for (const p of parsed.data.payments) {
    if (!validIds.has(p.participantId)) {
      return NextResponse.json({ error: "Participant not found on this Table" }, { status: 404 });
    }
    if (seen.has(p.participantId)) {
      return NextResponse.json(
        { error: "Each person can only appear once in the payer list." },
        { status: 400 },
      );
    }
    seen.add(p.participantId);
  }

  // Whoever paid the most becomes the "primary" payer for backward-compat
  // display code paths that only know about a single paidByParticipantId.
  const primary = [...parsed.data.payments].sort((a, b) => b.amount - a.amount)[0];

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { billId: bill.id } });
    await tx.payment.createMany({
      data: parsed.data.payments.map((p) => ({
        billId: bill.id,
        participantId: p.participantId,
        amount: p.amount,
      })),
    });
    await tx.bill.update({
      where: { id: bill.id },
      data: { paidByParticipantId: primary.participantId },
    });

    await logAudit({
      billId: bill.id,
      actionType: "PAYER_CHANGED",
      details: {
        payments: parsed.data.payments.map((p) => ({
          participantId: p.participantId,
          amount: p.amount,
          displayName: bill.participants.find((x) => x.id === p.participantId)?.displayName,
        })),
      },
      tx,
    });
  });

  await broadcast(bill.tableCode, "payer-changed", {});

  return NextResponse.json({ payments: parsed.data.payments });
}
