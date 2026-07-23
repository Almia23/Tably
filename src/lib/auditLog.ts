import { prisma } from "@/lib/prisma";
import type { AuditActionType, Prisma } from "@prisma/client";

/**
 * Records an entry in the Ledger (project-plan.md §2 feature 18 / §5.5).
 * Every mutation is logged against whichever participant performed it,
 * whether they're a guest or a logged-in user — no login required to act,
 * the log just always records who (or which guest) did what.
 */
export async function logAudit(params: {
  billId: string;
  participantId?: string | null;
  actionType: AuditActionType;
  targetId?: string | null;
  details?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? prisma;
  return client.auditLog.create({
    data: {
      billId: params.billId,
      participantId: params.participantId ?? null,
      actionType: params.actionType,
      targetId: params.targetId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}
