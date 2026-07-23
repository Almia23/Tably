"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getGuestIdentity, type GuestIdentity } from "@/lib/guestIdentity";
import { useTableChannel, isRealtimeConfigured } from "@/lib/pusherClient";
import type { SyncStatus, TableState } from "@/types/table";

type TableContextValue = {
  code: string;
  table: TableState | null;
  loading: boolean;
  error: string | null;
  identity: GuestIdentity | null;
  refresh: () => Promise<void>;
  syncStatus: SyncStatus;
  /** Sends a JSON body plus the current guest identity, retrying once on
   * failure — restaurant wifi is often flaky (project-plan.md §9 Flow 8),
   * so an action should never look "saved" on screen if it never synced.
   * Defaults to POST; pass method: "PATCH" for the few endpoints that use it. */
  authedFetch: (
    path: string,
    body?: Record<string, unknown>,
    method?: "POST" | "PATCH",
  ) => Promise<Response | null>;
  nameOf: (id: string | null) => string;
  colorClassOf: (id: string | null) => string;
};

// Stable per-participant color palette for name badges/chips, so the same
// person always shows the same color everywhere a name appears (item
// claims, participant list, settlement rows, activity feed). Written as
// complete literal class strings (not built with template interpolation)
// so Tailwind's JIT compiler can detect and generate them.
const PARTICIPANT_COLORS = [
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
];

const TableContext = createContext<TableContextValue | null>(null);

export function useTable() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error("useTable must be used within a table layout");
  return ctx;
}

export function TableProvider({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [table, setTable] = useState<TableState | null>(null);
  const [identity] = useState<GuestIdentity | null>(() => getGuestIdentity(code));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const identityRef = useRef<GuestIdentity | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/tables/${code}`);
    if (res.status === 404) {
      setError("Table not found.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTable(data);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    identityRef.current = getGuestIdentity(code);
    // Data fetch on mount/code-change — the documented, appropriate use of an
    // effect for synchronizing with an external system (the API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [code, refresh]);

  // Live sync via Pusher, lifted here (out of individual pages) so both the
  // Ledger and Your Order routes get updates from a single subscription
  // instead of double-subscribing (Part 1: "Data fetching / real-time").
  useTableChannel(code, {
    "participant-joined": refresh,
    "claim-updated": refresh,
    "item-added": refresh,
    "item-edited": refresh,
    "participant-saved": refresh,
    "participant-count-changed": refresh,
    "payer-changed": refresh,
    "tab-closed": refresh,
    "tab-reopened": refresh,
    "settlement-marked-paid": refresh,
  });

  useEffect(() => {
    if (isRealtimeConfigured()) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!loading && table && table.status === "OPEN" && !identity) {
      router.push(`/join/${code}`);
    }
  }, [loading, table, identity, code, router]);

  const authedFetch = useCallback(
    async (path: string, body: Record<string, unknown> = {}, method: "POST" | "PATCH" = "POST") => {
      const id = identityRef.current;
      const payload = JSON.stringify({
        participantId: id?.participantId,
        guestToken: id?.guestToken,
        ...body,
      });
      setSyncStatus("saving");
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: payload,
          });
          if (res.ok) {
            setSyncStatus("synced");
            setTimeout(() => setSyncStatus((s) => (s === "synced" ? "idle" : s)), 1500);
            return res;
          }
        } catch {
          // network error — fall through to retry/final error state
        }
      }
      setSyncStatus("error");
      return null;
    },
    [],
  );

  const nameOf = useCallback(
    (id: string | null) => table?.participants.find((p) => p.id === id)?.displayName ?? "Someone",
    [table],
  );

  const colorClassOf = useCallback(
    (id: string | null) => {
      const idx = table?.participants.findIndex((p) => p.id === id) ?? -1;
      if (idx < 0) return "bg-muted text-muted-foreground";
      return PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length];
    },
    [table],
  );

  return (
    <TableContext.Provider
      value={{ code, table, loading, error, identity, refresh, syncStatus, authedFetch, nameOf, colorClassOf }}
    >
      {children}
    </TableContext.Provider>
  );
}
