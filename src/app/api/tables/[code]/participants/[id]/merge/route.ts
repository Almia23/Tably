import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

/**
 * Guest-to-account merge (project-plan.md §5 "nudge to sign up after a Table
 * closes"). Attaches the current logged-in user to a guest Participant row
 * they created earlier in this browser, so their balance history/pairwise
 * balances (Phase 3) start including bills they only ever joined as a guest.
 *
 * Requires BOTH a valid session (proves who they are now) AND the original
 * guestToken (proves this is really their guest identity, not someone else's)
 * — otherwise anyone logged in could claim any guest's history.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const guestToken = body?.guestToken as string | undefined;
  if (!guestToken) {
    return NextResponse.json({ error: "Missing guestToken." }, { status: 400 });
  }

  const bill = await prisma.bill.findUnique({ where: { tableCode: code.toUpperCase() } });
  if (!bill) {
    return NextResponse.json({ error: "Table not found." }, { status: 404 });
  }

  const participant = await prisma.participant.findUnique({ where: { id } });
  if (!participant || participant.billId !== bill.id) {
    return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  }
  if (participant.guestToken !== guestToken) {
    return NextResponse.json({ error: "Token mismatch." }, { status: 403 });
  }
  if (participant.userId && participant.userId !== session.user.id) {
    return NextResponse.json(
      { error: "This participant is already linked to a different account." },
      { status: 409 },
    );
  }

  const updated = await prisma.participant.update({
    where: { id },
    data: { userId: session.user.id },
  });

  await logAudit({
    billId: bill.id,
    participantId: participant.id,
    actionType: "PARTICIPANT_LINKED_ACCOUNT",
    details: { userId: session.user.id },
  });

  return NextResponse.json({ ok: true, participantId: updated.id });
}
