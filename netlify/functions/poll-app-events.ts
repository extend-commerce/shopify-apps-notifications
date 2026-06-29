import type { Config } from "@netlify/functions";
import { fetchAppEvents, sleep } from "./lib/partner-api.js";
import { formatEvent, postToGoogleChat } from "./lib/chat.js";
import { loadState, saveState, getAppState, eventKey, type PollState } from "./lib/state.js";

export default async () => {
  const appIds = (process.env.SHOPIFY_APP_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (appIds.length === 0) {
    console.error("SHOPIFY_APP_IDS is empty - nothing to poll");
    return new Response("no app ids configured", { status: 200 });
  }

  let state: PollState;
  try {
    state = await loadState();
  } catch (err) {
    console.error("Failed to load poll state from Blobs:", err);
    return new Response("failed to load state", { status: 500 });
  }

  let totalFetched = 0;
  let totalPosted = 0;
  const failedApps: string[] = [];

  for (let i = 0; i < appIds.length; i++) {
    const appId = appIds[i];
    const appState = getAppState(state, appId);

    try {
      const events = await fetchAppEvents(appId, appState.lastCheckedAt);
      console.log(`App ${appId}: fetched ${events.length} event(s) since ${appState.lastCheckedAt}`);
      totalFetched += events.length;

      const seen = new Set(appState.seenKeys);
      const newEvents = events
        .map((event) => ({ event, key: eventKey(event.shop.myshopifyDomain, event.type, event.occurredAt) }))
        .filter(({ key }) => !seen.has(key))
        .sort((a, b) => a.event.occurredAt.localeCompare(b.event.occurredAt));

      let posted = 0;
      for (const { event, key } of newEvents) {
        try {
          await postToGoogleChat(formatEvent(event));
          posted += 1;
        } catch (err) {
          console.error(`Failed to post event ${key} to Google Chat:`, err);
        }
      }
      totalPosted += posted;

      // advance this app's own window regardless of other apps' outcomes
      if (newEvents.length > 0) {
        const maxOccurredAt = newEvents[newEvents.length - 1].event.occurredAt;
        const seenKeysAtMax = newEvents.filter(({ event }) => event.occurredAt === maxOccurredAt).map(({ key }) => key);
        state[appId] = { lastCheckedAt: maxOccurredAt, seenKeys: seenKeysAtMax };
      } else {
        state[appId] = appState;
      }
    } catch (err) {
      console.error(`Failed to poll app ${appId}:`, err);
      failedApps.push(appId);
      // leave state[appId] untouched so the next run retries the same window for this app only
    }

    // stay well under the 4 req/sec partner API rate limit shared across all apps
    if (i < appIds.length - 1) await sleep(300);
  }

  try {
    await saveState(state);
  } catch (err) {
    console.error("Failed to save poll state to Blobs:", err);
  }

  if (failedApps.length > 0) {
    console.error(`Some apps failed this run (will retry their own window next time): ${failedApps.join(", ")}`);
  }

  return new Response(JSON.stringify({ fetched: totalFetched, posted: totalPosted, failedApps }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  schedule: "*/2 * * * *",
};
