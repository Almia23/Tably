// Shared shape of a Table and its nested resources, used by both the Ledger
// and Your Order pages (src/app/table/[code]/). Centralized here so the two
// pages and the shared layout/context don't drift out of sync.

export type Claim = { id: string; participantId: string; shareFraction: number };

export type Item = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  lowConfidence: boolean;
  claims: Claim[];
};

export type Participant = {
  id: string;
  displayName: string;
  hasSaved: boolean;
  joinedAt: string;
  userId: string | null;
};

export type Settlement = {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
  viewMode: "SIMPLIFIED" | "INDIVIDUAL";
  settled: boolean;
};

export type AuditLog = {
  id: string;
  participantId: string | null;
  actionType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
};

export type TableState = {
  id: string;
  tableCode: string;
  groupLabel: string | null;
  imageUrl: string | null;
  status: "OPEN" | "CLOSED";
  taxAmount: number;
  tipAmount: number;
  expectedParticipants: number;
  paidByParticipantId: string | null;
  participants: Participant[];
  items: Item[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
};

export type SyncStatus = "idle" | "saving" | "synced" | "error";
