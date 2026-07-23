import type { AuditLog } from "@/types/table";

/**
 * Human-readable copy for each Ledger event type, plus which events are
 * noisy "I'm done" actions that shouldn't clutter the shared feed (3.4 —
 * only events that change shared state belong in the Ledger; personal
 * actions with no side effect on anyone else's view are demoted/hidden).
 *
 * Returns structured "parts" instead of a plain string so the Ledger page
 * can render participant names as colored PersonTag chips inline —
 * matching the colored-name treatment used everywhere else names appear
 * (item claims, Participants list, settlement rows).
 */

export type AuditPart =
  | { type: "text"; text: string }
  | { type: "name"; participantId: string | null; fallback: string };

function text(value: string): AuditPart {
  return { type: "text", text: value };
}

function name(participantId: string | null, fallback = "Someone"): AuditPart {
  return { type: "name", participantId, fallback };
}

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

export function describeAudit(log: AuditLog): AuditPart[] {
  const details = log.details ? safeJson(log.details) : {};
  switch (log.actionType) {
    case "BILL_CREATED":
      return [text(`Table created (expecting ${details.expectedParticipants ?? "?"} people)`)];
    case "PARTICIPANT_JOINED":
      return [name(log.participantId, details.displayName as string | undefined), text("joined")];
    case "ITEM_ADDED":
      return [name(log.participantId), text(`added "${details.name}"`)];
    case "ITEM_EDITED": {
      const before = (details.before as Record<string, unknown>) ?? {};
      const after = (details.after as Record<string, unknown>) ?? {};
      const changes = Object.entries(after)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${before[k]} → ${v}`);
      return changes.length > 0
        ? [name(log.participantId), text(`corrected an item (${changes.join(", ")})`)]
        : [name(log.participantId), text("confirmed an item was correct")];
    }
    case "CLAIM_SAVED":
      return [name(log.participantId), text("saved their order")];
    case "CLAIM_EDITED":
      return [name(log.participantId), text("updated a claim")];
    case "ITEM_BECAME_SHARED": {
      const ids = (details.participantIds as string[]) ?? [];
      const parts: AuditPart[] = [text("An item is now shared between")];
      ids.forEach((id, i) => {
        parts.push(name(id));
        if (i < ids.length - 1) parts.push(text(","));
      });
      return parts;
    }
    case "PARTICIPANT_COUNT_CHANGED":
      return [text(`Expected headcount changed to ${details.expectedParticipants}`)];
    case "PAYER_CHANGED": {
      const payments = details.payments as
        | { participantId: string; amount: number; displayName?: string }[]
        | undefined;
      if (payments && payments.length > 0) {
        const parts: AuditPart[] = [text("Paid by")];
        payments.forEach((p, i) => {
          parts.push(name(p.participantId, p.displayName));
          parts.push(text(`(₹${p.amount.toFixed(2)})${i < payments.length - 1 ? "," : ""}`));
        });
        return parts;
      }
      // Legacy single-payer log shape (before multi-payer support).
      return [name(null, details.displayName as string | undefined), text("is now marked as having paid")];
    }
    case "TAB_CLOSED":
      return [text("Final split generated — Tab closed")];
    case "TAB_REOPENED":
      return [text("Tab reopened")];
    case "SETTLEMENT_MARKED_PAID":
      return [
        name(log.participantId, details.displayName as string | undefined),
        text(`marked a settlement of ₹${details.amount ?? "?"} as paid`),
      ];
    case "CLARIFICATION_RAISED":
      return [text(`Low confidence on "${details.name}" — needs a quick check`)];
    case "CLARIFICATION_RESOLVED":
      return [text(`"${details.name}" confirmed`)];
    case "PARTICIPANT_LINKED_ACCOUNT":
      return [name(log.participantId), text("linked their account")];
    default:
      return [text(log.actionType)];
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
