/**
 * Deterministic debt-simplification (min cash-flow) algorithm.
 *
 * Explicitly NOT using an LLM here — this is a solved graph/greedy problem;
 * an LLM would be slower, non-deterministic, and unauditable for money math
 * (see project-plan.md §3, "considered rejection").
 *
 * Given each participant's net balance (positive = is owed money, negative =
 * owes money), greedily match the largest creditor with the largest debtor
 * until all balances are ~0. This minimizes the number of transactions
 * needed to settle the group ("Simplified" view in the plan's Smart Settle
 * toggle).
 */

export type Balance = {
  participantId: string;
  netBalance: number; // positive = owed money, negative = owes money
};

export type SimplifiedTransaction = {
  fromParticipantId: string; // owes money
  toParticipantId: string; // is owed money
  amount: number;
};

const EPSILON = 0.01; // ignore balances under a cent to avoid float dust

export function simplifyDebts(balances: Balance[]): SimplifiedTransaction[] {
  // Work on a copy, rounded to cents, dropping ~zero balances.
  const working = balances
    .map((b) => ({ ...b, netBalance: Math.round(b.netBalance * 100) / 100 }))
    .filter((b) => Math.abs(b.netBalance) > EPSILON);

  const transactions: SimplifiedTransaction[] = [];

  while (working.length > 0) {
    // Largest creditor (most owed) and largest debtor (owes most).
    working.sort((a, b) => a.netBalance - b.netBalance);
    const debtor = working[0]; // most negative
    const creditor = working[working.length - 1]; // most positive

    if (debtor === creditor) break; // shouldn't happen, safety net

    const amount = Math.min(-debtor.netBalance, creditor.netBalance);
    const rounded = Math.round(amount * 100) / 100;

    if (rounded > EPSILON) {
      transactions.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amount: rounded,
      });
    }

    debtor.netBalance += rounded;
    creditor.netBalance -= rounded;

    // Remove settled participants (balance ~0 now).
    for (let i = working.length - 1; i >= 0; i--) {
      if (Math.abs(working[i].netBalance) <= EPSILON) working.splice(i, 1);
    }
  }

  return transactions;
}

/**
 * "Individual" view (§2 feature 10) computed directly from item claims —
 * used once bills can have multiple payers/secondary settlements (Phase 3+).
 * Phase 1's single-payer flow derives the individual view more directly from
 * net balances instead (see src/app/api/tables/[code]/finalize/route.ts); this
 * is kept here
 * for that future multi-payer case.
 */
export type ItemClaim = {
  itemId: string;
  price: number;
  quantity: number;
  claims: { participantId: string; shareFraction: number }[];
};

export function individualDebts(
  items: ItemClaim[],
  paidByParticipantId: string,
): SimplifiedTransaction[] {
  const pairwise = new Map<string, number>(); // key `${from}->${to}` = amount from owes to

  for (const item of items) {
    const itemTotal = item.price * item.quantity;
    for (const claim of item.claims) {
      if (claim.participantId === paidByParticipantId) continue;
      const owed = itemTotal * claim.shareFraction;
      if (owed <= 0) continue;
      const key = `${claim.participantId}->${paidByParticipantId}`;
      pairwise.set(key, (pairwise.get(key) ?? 0) + owed);
    }
  }

  return Array.from(pairwise.entries())
    .map(([key, amount]) => {
      const [fromParticipantId, toParticipantId] = key.split("->");
      return { fromParticipantId, toParticipantId, amount: Math.round(amount * 100) / 100 };
    })
    .filter((t) => t.amount > EPSILON);
}
