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
};

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

  return (
    <TableContext.Provider
      value={{ code, table, loading, error, identity, refresh, syncStatus, authedFetch, nameOf }}
    >
      {children}
    </TableContext.Provider>
  );
}
