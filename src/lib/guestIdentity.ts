"use client";

/**
 * Persists a guest's identity (participantId + guestToken) for a Table in
 * localStorage, scoped per table code — so a guest who closes their browser
 * and comes back via the same link/code is recognized rather than treated as
 * a fresh joiner (project-plan.md §9 Flow 7).
 */

export type GuestIdentity = {
  participantId: string;
  guestToken: string;
  displayName: string;
};

function key(tableCode: string) {
  return `tably:table:${tableCode}`;
}

export function saveGuestIdentity(tableCode: string, identity: GuestIdentity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(tableCode), JSON.stringify(identity));
}

export function getGuestIdentity(tableCode: string): GuestIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key(tableCode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestIdentity;
  } catch {
    return null;
  }
}

export function clearGuestIdentity(tableCode: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(tableCode));
}
