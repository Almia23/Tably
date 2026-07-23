import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { generateTableCode } from "@/lib/tableCode";
import { logAudit } from "@/lib/auditLog";
import { auth } from "@/lib/auth";
import { toTitleCase } from "@/lib/textCase";

const ItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  lowConfidence: z.boolean().default(false),
});

const CreateTableSchema = z.object({
  groupLabel: z.string().optional(),
  rawLlmOutput: z.unknown().optional(),
  taxAmount: z.number().nonnegative().default(0),
  tipAmount: z.number().nonnegative().default(0),
  taxTipSplit: z.enum(["EVEN", "PROPORTIONAL"]).default("EVEN"),
  expectedParticipants: z.number().int().min(1),
  creatorName: z.string().min(1),
  items: z.array(ItemSchema).min(1),
});

/**
 * Creates a Table (project-plan.md §2 features 2, 11): a live, joinable bill
 * session. The creator becomes the first Participant; everyone else joins
 * via the Table Code and claims their own items in real time (Phase 2),
 * rather than one admin tagging on everyone's behalf (that was Phase 1).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const json = await req.json().catch(() => null);
  const parsed = CreateTableSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    groupLabel,
    rawLlmOutput,
    taxAmount,
    tipAmount,
    taxTipSplit,
    expectedParticipants,
    creatorName,
    items,
  } = parsed.data;

  let tableCode = generateTableCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.bill.findUnique({ where: { tableCode } });
    if (!existing) break;
    tableCode = generateTableCode();
  }

  const guestToken = nanoid();

  const result = await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.create({
      data: {
        tableCode,
        groupLabel,
        rawLlmOutput: rawLlmOutput ? JSON.stringify(rawLlmOutput) : undefined,
        taxAmount,
        tipAmount,
        taxTipSplit,
        expectedParticipants,
        status: "OPEN",
        createdByUserId: session?.user?.id ?? null,
      },
    });

    const creator = await tx.participant.create({
      data: {
        billId: bill.id,
        userId: session?.user?.id ?? null,
        guestName: session?.user?.id ? null : creatorName,
        guestToken,
        displayName: creatorName,
      },
    });

    await tx.bill.update({
      where: { id: bill.id },
      data: { paidByParticipantId: creator.id }, // default to creator; editable later
    });

    for (const item of items) {
      const created = await tx.billItem.create({
        data: {
          billId: bill.id,
          name: toTitleCase(item.name),
          price: item.price,
          quantity: item.quantity,
          lowConfidence: item.lowConfidence,
          addedByParticipantId: creator.id,
        },
      });

      if (item.lowConfidence) {
        await logAudit({
          billId: bill.id,
          participantId: creator.id,
          actionType: "CLARIFICATION_RAISED",
          targetId: created.id,
          details: { name: created.name },
          tx,
        });
      }
    }

    await logAudit({
      billId: bill.id,
      participantId: creator.id,
      actionType: "BILL_CREATED",
      details: { expectedParticipants, itemCount: items.length },
      tx,
    });

    return { bill, creator };
  });

  return NextResponse.json(
    {
      tableCode: result.bill.tableCode,
      participantId: result.creator.id,
      guestToken,
      displayName: result.creator.displayName,
    },
    { status: 201 },
  );
}
