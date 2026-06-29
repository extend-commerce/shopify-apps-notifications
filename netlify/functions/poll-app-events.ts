import type { Config } from "@netlify/functions";
import { fetchAppEvents, type FetchedEvent } from "./lib/partner-api.js";
import { formatEvent, postToGoogleChat } from "./lib/chat.js";
import { loadState, saveState, eventKey } from "./lib/state.js";

export default async () => {
  const appIds = (process.env.SHOPIFY_APP_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (appIds.length === 0) {
    console.error("SHOPIFY_APP_IDS is empty - nothing to poll");
    return new Response("no app ids configured", { status: 200 });
  }

  const state = await loadState();
  const allEvents: FetchedEvent[] = [];
  const failedApps: string[] = [];

  for (const appId of appIds) {
    try {
      const events = await fetchAppEvents(appId, state.lastCheckedAt);
      allEvents.push(...events);
    } catch (err) {
      console.error(`Failed to poll app ${appId}:`, err);
      failedApps.push(appId);
    }
  }

  // drop anything already notified (exact repeats on the lastCheckedAt boundary)
  const seen = new Set(state.seenKeys);
  const newEvents = allEvents
    .map((event) => ({
      event,
      key: eventKey(event.shop.myshopifyDomain, event.type, event.occurredAt),
    }))
    .filter(({ key }) => !seen.has(key))
    .sort((a, b) => a.event.occurredAt.localeCompare(b.event.occurredAt));

  for (const { event } of newEvents) {
    try {
      await postToGoogleChat(formatEvent(event));
    } catch (err) {
      console.error("Failed to post to Google Chat:", err);
    }
  }

  if (failedApps.length === 0) {
    if (newEvents.length > 0) {
      const maxOccurredAt = newEvents[newEvents.length - 1].event.occurredAt;
      const seenKeysAtMax = newEvents.filter(({ event }) => event.occurredAt === maxOccurredAt).map(({ key }) => key);
      await saveState({ lastCheckedAt: maxOccurredAt, seenKeys: seenKeysAtMax });
    }
  } else {
    console.error(`Skipped advancing lastCheckedAt due to failures in apps: ${failedApps.join(", ")}`);
  }

  return new Response(JSON.stringify({ posted: newEvents.length, failedApps }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  schedule: "*/2 * * * *",
};
