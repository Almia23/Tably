"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { Copy, Check, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TableProvider, useTable } from "./table-context";

/**
 * Shared chrome for both Table views (project-plan.md §5.5 Two-Page Session
 * Architecture): fetches/subscribes to table data once, and renders the
 * persistent header (Table Code + copy link, Ledger|Your Order nav, sync
 * status, closed banner) so neither child route has to duplicate it.
 */
export default function TableLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();

  return (
    <TableProvider code={code}>
      <TableChrome>{children}</TableChrome>
    </TableProvider>
  );
}

function TableChrome({ children }: { children: React.ReactNode }) {
  const { table, loading, error, syncStatus, code } = useTable();
  const pathname = usePathname();
  const [linkCopyLabel, setLinkCopyLabel] = useState<"idle" | "copied">("idle");

  function copyJoinLink() {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopyLabel("copied");
      setTimeout(() => setLinkCopyLabel("idle"), 1500);
    });
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!table) return null;

  const joinedCount = table.participants.length;
  const isClosed = table.status === "CLOSED";
  const isOrderTab = pathname?.endsWith("/order");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.25rem)] max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-5 text-primary" aria-hidden />
            {table.groupLabel && (
              <h1 className="text-lg font-semibold tracking-tight">{table.groupLabel}</h1>
            )}
            <span className="table-code-badge" title="Table Code — share this to invite guests">
              {table.tableCode}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {syncStatus !== "idle" && (
              <span
                className={`text-xs ${
                  syncStatus === "error"
                    ? "text-destructive"
                    : syncStatus === "saving"
                      ? "text-muted-foreground"
                      : "text-owed"
                }`}
              >
                {syncStatus === "saving" && "Saving…"}
                {syncStatus === "synced" && "✓ Synced"}
                {syncStatus === "error" && "⚠️ Couldn't sync — check your connection"}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyJoinLink}
              className="gap-1.5"
            >
              {linkCopyLabel === "copied" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {linkCopyLabel === "copied" ? "Copied!" : "Copy join link"}
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {joinedCount}/{table.expectedParticipants} joined · {isClosed ? "Closed" : "Open"}
        </p>

        <nav aria-label="Table views" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-[3px]">
          <Link
            href={`/table/${code}`}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !isOrderTab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ledger
          </Link>
          <Link
            href={`/table/${code}/order`}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isOrderTab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Your Order
          </Link>
        </nav>

        {isClosed && (
          <Alert>
            <AlertDescription>
              Table closed — {isOrderTab ? "there's nothing left to claim. " : ""}
              view the final split in the Ledger below.
            </AlertDescription>
          </Alert>
        )}
      </header>

      {children}
    </div>
  );
}
