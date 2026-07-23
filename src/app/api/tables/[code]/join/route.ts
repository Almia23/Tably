import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { broadcast } from "@/lib/pusher";
import { auth } from "@/lib/auth";

const JoinSchema = z.object({ name: z.string().min(1) });

/**
 * Table Code join flow (project-plan.md §2 features 3, 11; §9 Flow 2).
 * Guests never need an account — they're identified by name + a guestToken
 * persisted client-side (src/lib/guestIdentity.ts) for this Table only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const session = await auth();
  const json = await req.json().catch(() => null);
  const parsed = JoinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const bill = await prisma.bill.findUnique({
    where: { tableCode: code.toUpperCase() },
    include: { participants: true },
  });

  if (!bill) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  if (bill.status === "CLOSED") {
    // Late joiners land on the results view instead of a confusing empty
    // claim screen — no participant identity needed to just view (§9 Flow 2).
    return NextResponse.json({ closed: true, tableCode: bill.tableCode }, { status: 409 });
  }

  if (bill.participants.length >= bill.expectedParticipants) {
    return NextResponse.json(
      {
        atCapacity: true,
        error:
          "This Table is at capacity. Ask someone already at the table to bump the expected count.",
      },
      { status: 409 },
    );
  }

  // Auto-disambiguate name collisions (§9 Flow 2) rather than blocking the join.
  const requestedName = parsed.data.name.trim();
  const existingNames = new Set(bill.participants.map((p) => p.displayName));
  let displayName = requestedName;
  let suffix = 2;
  while (existingNames.has(displayName)) {
    displayName = `${requestedName} (${suffix})`;
    suffix += 1;
  }

  const guestToken = nanoid();

  const participant = await prisma.$transaction(async (tx) => {
    const created = await tx.participant.create({
      data: {
        billId: bill.id,
        userId: session?.user?.id ?? null,
        guestName: session?.user?.id ? null : requestedName,
        guestToken,
        displayName,
      },
    });

    await logAudit({
      billId: bill.id,
      participantId: created.id,
      actionType: "PARTICIPANT_JOINED",
      details: { displayName },
      tx,
    });

    return created;
  });

  await broadcast(bill.tableCode, "participant-joined", {
    id: participant.id,
    displayName: participant.displayName,
  });

  return NextResponse.json(
    {
      participantId: participant.id,
      guestToken,
      displayName: participant.displayName,
      renamed: displayName !== requestedName,
    },
    { status: 201 },
  );
}
