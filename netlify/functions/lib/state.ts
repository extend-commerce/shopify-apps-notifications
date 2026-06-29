import { getStore } from "@netlify/blobs";

const STORE_NAME = "shopify-app-events";
const KEY = "poll-state";

export interface AppPollState {
  lastCheckedAt: string;
  seenKeys: string[];
}

export type PollState = Record<string, AppPollState>;

export function eventKey(domain: string, type: string, occurredAt: string): string {
  return `${domain}|${type}|${occurredAt}`;
}

export async function loadState(): Promise<PollState> {
  const store = getStore(STORE_NAME);
  const existing = await store.get(KEY, { type: "json" });
  return (existing as PollState | null) ?? {};
}

export function getAppState(state: PollState, appId: string): AppPollState {
  const existing = state[appId];
  if (existing) return existing;

  // first run for this app: look back 5 minutes to avoid flooding Chat with old events
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return { lastCheckedAt: fiveMinutesAgo, seenKeys: [] };
}

export async function saveState(state: PollState): Promise<void> {
  const store = getStore(STORE_NAME);
  await store.setJSON(KEY, state);
}
