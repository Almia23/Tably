import { prisma } from "@/lib/prisma";

/**
 * Lightweight actor verification for guest mutations: confirms the
 * (participantId, guestToken) pair the client is claiming actually matches
 * a participant on this bill. Not full session security, but enough to keep
 * the audit log (project-plan.md §2 feature 18) trustworthy without
 * requiring anyone to log in.
 */
export async function verifyParticipant(
  billId: string,
  participantId: string | undefined,
  guestToken: string | undefined,
) {
  if (!participantId) return null;
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
  });
  if (!participant || participant.billId !== billId) return null;
  // Logged-in participants (future phase) won't have a guestToken to check.
  if (participant.guestToken && participant.guestToken !== guestToken) return null;
  return participant;
}
