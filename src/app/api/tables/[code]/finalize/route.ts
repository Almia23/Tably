import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simplifyDebts, individualDebtsMultiPayer, type Balance } from "@/lib/debt";
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
    include: { participants: true, items: { include: { claims: true } }, payments: true },
  });
  if (!bill) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (bill.status === "CLOSED") {
    return NextResponse.json({ error: "This Table is already closed." }, { status: 409 });
  }

  const unclaimedItems = bill.items.filter((it) => it.claims.length === 0);
  if (unclaimedItems.length > 0) {
    return NextResponse.json(
      {
        error: `${unclaimedItems.length} item(s) still have no one claiming them (${unclaimedItems
          .map((it) => it.name)
          .join(", ")}) — everything needs a claimant before the Tab can close.`,
      },
      { status: 400 },
    );
  }

  const participantIds = bill.participants.map((p) => p.id);
  const itemsTotal = bill.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const taxTipTotal = bill.taxAmount + bill.tipAmount;
  const billTotal = itemsTotal + taxTipTotal;

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

  // Snapshot each participant's total consumption cost (items + tax/tip
  // share) before crediting payments — this is what the "Individual" view
  // attributes across payers below.
  const consumption = participantIds.map((pid) => ({
    participantId: pid,
    amountOwed: -(netBalance.get(pid) ?? 0),
  }));

  // Multi-payer support (project-plan.md §2 feature 7 extended): prefer
  // explicit Payment rows if any exist; otherwise fall back to the legacy
  // single paidByParticipantId field (Tables created before this feature, or
  // that never had multi-payer set up) as an implicit full-amount payment.
  const payments =
    bill.payments.length > 0
      ? bill.payments.map((p) => ({ participantId: p.participantId, amount: p.amount }))
      : bill.paidByParticipantId
        ? [{ participantId: bill.paidByParticipantId, amount: billTotal }]
        : [];

  if (payments.length === 0) {
    return NextResponse.json({ error: "No payer set for this Table." }, { status: 400 });
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  if (Math.abs(totalPaid - billTotal) > 0.01) {
    return NextResponse.json(
      {
        error: `Payments (₹${totalPaid.toFixed(2)}) don't add up to the bill total (₹${billTotal.toFixed(2)}) — fix who paid what before closing.`,
      },
      { status: 400 },
    );
  }

  // Credit each payer for what they actually fronted.
  for (const payment of payments) {
    netBalance.set(payment.participantId, (netBalance.get(payment.participantId) ?? 0) + payment.amount);
  }

  const balances: Balance[] = participantIds.map((id) => ({
    participantId: id,
    netBalance: netBalance.get(id) ?? 0,
  }));
  const simplified = simplifyDebts(balances);
  // "Individual" view: everyone's full consumption cost attributed directly
  // to whoever paid, proportional to each payer's share of the bill — this
  // is a distinct (and typically longer) transaction list than Simplified's
  // minimized graph once there's more than one payer.
  const individual = individualDebtsMultiPayer(consumption, payments);

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
