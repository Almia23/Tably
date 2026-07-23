import type { AuditLog } from "@/types/table";

/**
 * Human-readable copy for each Ledger event type, plus which events are
 * noisy "I'm done" actions that shouldn't clutter the shared feed (3.4 —
 * only events that change shared state belong in the Ledger; personal
 * actions with no side effect on anyone else's view are demoted/hidden).
 */

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Event types that are still recorded in the raw AuditLog table (for audit
// purposes) but are deliberately not rendered in the Ledger feed, since they
// don't change anything anyone else needs to see — they get a lightweight
// "✓ saved" badge next to the participant's name instead (see order/page.tsx
// participant list / Ledger participant summary).
const HIDDEN_FROM_FEED = new Set(["CLAIM_SAVED"]);

export function isFeedVisible(log: AuditLog): boolean {
  return !HIDDEN_FROM_FEED.has(log.actionType);
}

export function describeAudit(
  log: AuditLog,
  nameOf: (id: string | null) => string,
): string {
  const details = log.details ? safeJson(log.details) : {};
  switch (log.actionType) {
    case "BILL_CREATED":
      return `Table created (expecting ${details.expectedParticipants ?? "?"} people)`;
    case "PARTICIPANT_JOINED":
      return `${details.displayName ?? nameOf(log.participantId)} joined`;
    case "ITEM_ADDED":
      return `${nameOf(log.participantId)} added "${details.name}"`;
    case "ITEM_EDITED": {
      const before = (details.before as Record<string, unknown>) ?? {};
      const after = (details.after as Record<string, unknown>) ?? {};
      const changes = Object.entries(after)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${before[k]} → ${v}`);
      return changes.length > 0
        ? `${nameOf(log.participantId)} corrected an item (${changes.join(", ")})`
        : `${nameOf(log.participantId)} confirmed an item was correct`;
    }
    case "CLAIM_SAVED":
      return `${nameOf(log.participantId)} saved their order`;
    case "CLAIM_EDITED":
      return `${nameOf(log.participantId)} updated a claim`;
    case "ITEM_BECAME_SHARED":
      return `An item is now shared between ${((details.participantIds as string[]) ?? [])
        .map((id: string) => nameOf(id))
        .join(", ")}`;
    case "PARTICIPANT_COUNT_CHANGED":
      return `Expected headcount changed to ${details.expectedParticipants}`;
    case "PAYER_CHANGED":
      return `${details.displayName ?? "Someone"} is now marked as having paid`;
    case "TAB_CLOSED":
      return "Final split generated — Tab closed";
    case "TAB_REOPENED":
      return "Tab reopened";
    case "SETTLEMENT_MARKED_PAID": {
      const actorName = (details.displayName as string | undefined) ?? nameOf(log.participantId);
      return `${actorName} marked a settlement of ₹${details.amount ?? "?"} as paid`;
    }
    case "CLARIFICATION_RAISED":
      return `Low confidence on "${details.name}" — needs a quick check`;
    case "CLARIFICATION_RESOLVED":
      return `"${details.name}" confirmed`;
    case "PARTICIPANT_LINKED_ACCOUNT":
      return `${nameOf(log.participantId)} linked their account`;
    default:
      return log.actionType;
  }
}

// One icon per event "kind" so the feed is scannable at a glance (4.3),
// grouped by the same categories used in describeAudit above.
export type AuditIconKind =
  | "join"
  | "item"
  | "claim"
  | "flag"
  | "check"
  | "count"
  | "payer"
  | "close"
  | "reopen"
  | "settle"
  | "link"
  | "default";

export function auditIconKind(log: AuditLog): AuditIconKind {
  switch (log.actionType) {
    case "PARTICIPANT_JOINED":
      return "join";
    case "ITEM_ADDED":
    case "ITEM_EDITED":
    case "ITEM_BECAME_SHARED":
      return "item";
    case "CLAIM_SAVED":
    case "CLAIM_EDITED":
      return "claim";
    case "CLARIFICATION_RAISED":
      return "flag";
    case "CLARIFICATION_RESOLVED":
      return "check";
    case "PARTICIPANT_COUNT_CHANGED":
      return "count";
    case "PAYER_CHANGED":
      return "payer";
    case "TAB_CLOSED":
      return "close";
    case "TAB_REOPENED":
      return "reopen";
    case "SETTLEMENT_MARKED_PAID":
      return "settle";
    case "PARTICIPANT_LINKED_ACCOUNT":
      return "link";
    default:
      return "default";
  }
}
