import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simplifyDebts, type Balance } from "@/lib/debt";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";

/**
 * Close the Tab (project-plan.md §2 feature 17). Suggested automatically once
 * joined-count matches expected count and everyone has saved, but this route
 * is the manual override that's *always* available — the client is
 * responsible for showing a warning listing anyone who hasn't saved yet
 * before calling this, since we never silently auto-lock (§9 Flow 5).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const bill = await prisma.bill.findUnique({
    where: { tableCode: code.toUpperCase() },
    include: { participants: true, items: { include: { claims: true } } },
  });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json({ error: "This Table is already closed." }, { status: 409 });
  }
  if (!bill.paidByParticipantId) {
    return NextResponse.json({ error: "No payer set for this Table." }, { status: 400 });
  }

  const participantIds = bill.participants.map((p) => p.id);
  const itemsTotal = bill.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const taxTipTotal = bill.taxAmount + bill.tipAmount;

  const netBalance = new Map<string, number>(participantIds.map((id) => [id, 0]));

  for (const item of bill.items) {
    const itemTotal = item.price * item.quantity;
    const per = item.claims.length > 0 ? itemTotal / item.claims.length : 0;
    for (const claim of item.claims) {
      netBalance.set(claim.participantId, (netBalance.get(claim.participantId) ?? 0) - per);
    }
  }

  for (const pid of participantIds) {
    let taxTipShare: number;
    if (bill.taxTipSplit === "PROPORTIONAL" && itemsTotal > 0) {
      const owedForItems = -(netBalance.get(pid) ?? 0);
      taxTipShare = taxTipTotal * (owedForItems / itemsTotal);
    } else {
      taxTipShare = taxTipTotal / participantIds.length;
    }
    netBalance.set(pid, (netBalance.get(pid) ?? 0) - taxTipShare);
  }

  // "Individual" view: exact per-person total owed to the payer (items + tax/tip),
  // snapshotted before crediting the payer for the full bill (see Phase 1 note
  // in src/lib/debt.ts on why this equals "Simplified" for single-payer bills).
  const individual = participantIds
    .filter((pid) => pid !== bill.paidByParticipantId)
    .map((pid) => ({
      fromParticipantId: pid,
      toParticipantId: bill.paidByParticipantId!,
      amount: Math.round(-(netBalance.get(pid) ?? 0) * 100) / 100,
    }))
    .filter((t) => t.amount > 0.01);

  const billTotal = itemsTotal + taxTipTotal;
  netBalance.set(
    bill.paidByParticipantId,
    (netBalance.get(bill.paidByParticipantId) ?? 0) + billTotal,
  );

  const balances: Balance[] = participantIds.map((id) => ({
    participantId: id,
    netBalance: netBalance.get(id) ?? 0,
  }));
  const simplified = simplifyDebts(balances);

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    // Clear any settlements from a previous close (reopen/re-close cycle).
    await tx.settlement.deleteMany({ where: { billId: bill.id } });

    for (const t of simplified) {
      await tx.settlement.create({
        data: { billId: bill.id, ...t, viewMode: "SIMPLIFIED" },
      });
    }
    for (const t of individual) {
      await tx.settlement.create({
        data: { billId: bill.id, ...t, viewMode: "INDIVIDUAL" },
      });
    }

    await logAudit({
      billId: bill.id,
      actionType: "TAB_CLOSED",
      details: { simplifiedCount: simplified.length },
      tx,
    });
  });

  await broadcast(bill.tableCode, "tab-closed", {});

  return NextResponse.json({ status: "CLOSED" });
}
