"use client";

import PusherClient from "pusher-js";
import { useEffect, useRef } from "react";

const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

function isConfigured() {
  return Boolean(KEY && !KEY.includes("replace-me"));
}

let client: PusherClient | null = null;

function getClient(): PusherClient | null {
  if (!isConfigured()) return null;
  if (!client) {
    client = new PusherClient(KEY!, { cluster: CLUSTER || "us2" });
  }
  return client;
}

/**
 * Subscribes to a Table's live channel for the lifetime of the component.
 * When Pusher isn't configured (dev placeholders), `connected` stays false
 * and the caller should fall back to polling — see `usePollingFallback`.
 */
export function useTableChannel(
  tableCode: string,
  handlers: Record<string, (data: unknown) => void>,
) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const pusher = getClient();
    if (!pusher) return;

    const channel = pusher.subscribe(`table-${tableCode}`);
    const bound: [string, (data: unknown) => void][] = [];

    for (const event of Object.keys(handlersRef.current)) {
      const fn = (data: unknown) => handlersRef.current[event]?.(data);
      channel.bind(event, fn);
      bound.push([event, fn]);
    }

    return () => {
      for (const [event, fn] of bound) channel.unbind(event, fn);
      pusher.unsubscribe(`table-${tableCode}`);
    };
  }, [tableCode]);
}

export function isRealtimeConfigured() {
  return isConfigured();
}
