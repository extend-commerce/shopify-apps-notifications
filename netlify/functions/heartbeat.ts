import type { Config } from "@netlify/functions";
import { postToGoogleChat } from "./lib/chat.js";

// Runs on a schedule Netlify officially supports (unlike the */2 poller), so its
// presence in Chat is proof the account's scheduled functions are still firing at all.
export default async () => {
  await postToGoogleChat("✅ All systems are live and working properly.");
  return new Response("ok", { status: 200 });
};

export const config: Config = {
  schedule: "@daily",
};
