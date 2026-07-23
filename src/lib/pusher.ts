import Pusher from "pusher";

function isConfigured(): boolean {
  const key = process.env.PUSHER_KEY;
  return Boolean(key && !key.includes("replace-me"));
}

let client: Pusher | null = null;

function getClient(): Pusher | null {
  if (!isConfigured()) return null;
  if (!client) {
    client = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return client;
}

export const TABLE_CHANNEL_PREFIX = "table-";

export function tableChannel(tableCode: string) {
  return `${TABLE_CHANNEL_PREFIX}${tableCode}`;
}

/**
 * Broadcasts a live-sync event to everyone connected to a Table (project-plan.md
 * §2 feature 4). No-ops quietly when Pusher isn't configured (local dev with
 * placeholder keys) — callers should still write to the DB and the client
 * falls back to polling, so nothing is lost, it's just not instant.
 */
export async function broadcast(
  tableCode: string,
  event: string,
  data: Record<string, unknown>,
) {
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(tableChannel(tableCode), event, data);
  } catch (err) {
    console.error(`[pusher] failed to broadcast ${event} for ${tableCode}:`, err);
  }
}
