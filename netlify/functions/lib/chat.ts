import type { FetchedEvent } from "./partner-api.js";

const EVENT_EMOJI: Record<string, string> = {
  RELATIONSHIP_INSTALLED: "🎉",
  RELATIONSHIP_UNINSTALLED: "👋",
  RELATIONSHIP_REACTIVATED: "🔁",
  RELATIONSHIP_DEACTIVATED: "🔴",
  SUBSCRIPTION_CHARGE_ACTIVATED: "💳",
  SUBSCRIPTION_CHARGE_CANCELED: "❌",
  SUBSCRIPTION_CHARGE_FROZEN: "🧊",
  SUBSCRIPTION_CHARGE_UNFROZEN: "✅",
  SUBSCRIPTION_CHARGE_DECLINED: "⚠️",
  SUBSCRIPTION_CHARGE_EXPIRED: "⏱️",
  ONE_TIME_CHARGE_ACTIVATED: "💰",
};

export function formatEvent(event: FetchedEvent): string {
  const emoji = EVENT_EMOJI[event.type] ?? "ℹ️";
  const shop = event.shop?.name ?? "Unknown shop";
  const domain = event.shop?.myshopifyDomain ?? "unknown-domain";
  const app = event.appName;
  const chargeName = event.charge?.name;
  const amount = event.charge?.amount ? `${event.charge.amount.amount} ${event.charge.amount.currencyCode}` : null;

  switch (event.type) {
    case "RELATIONSHIP_INSTALLED":
      return `${emoji} ${app} has been installed on ${shop} (${domain}).`;
    case "RELATIONSHIP_UNINSTALLED": {
      const reason = event.reason ? ` Reason: ${event.reason}.` : "";
      return `${emoji} ${app} has been uninstalled from ${shop} (${domain}).${reason}`;
    }
    case "RELATIONSHIP_REACTIVATED":
      return `${emoji} ${app} has been reinstalled on ${shop} (${domain}).`;
    case "RELATIONSHIP_DEACTIVATED":
      return `${emoji} ${shop} (${domain}) has deactivated ${app}.`;
    case "SUBSCRIPTION_CHARGE_ACTIVATED":
      return `${emoji} ${shop} (${domain}) has subscribed to ${chargeName ?? "a plan"}${amount ? ` (${amount})` : ""} for ${app}.`;
    case "SUBSCRIPTION_CHARGE_CANCELED":
      return `${emoji} ${shop} (${domain}) has unsubscribed for ${app}.`;
    case "SUBSCRIPTION_CHARGE_FROZEN":
      return `${emoji} ${shop} (${domain})'s subscription for ${app} has been frozen.`;
    case "SUBSCRIPTION_CHARGE_UNFROZEN":
      return `${emoji} ${shop} (${domain})'s subscription for ${app} has been unfrozen.`;
    case "SUBSCRIPTION_CHARGE_DECLINED":
      return `${emoji} Payment failed for ${shop} (${domain}) on ${app}.`;
    case "SUBSCRIPTION_CHARGE_EXPIRED":
      return `${emoji} Trial expired for ${shop} (${domain}) on ${app}.`;
    case "ONE_TIME_CHARGE_ACTIVATED":
      return `${emoji} ${shop} (${domain}) purchased ${chargeName ?? "a one-time charge"}${amount ? ` (${amount})` : ""} for ${app}.`;
    default:
      return `${emoji} ${app} event ${event.type} for ${shop} (${domain}).`;
  }
}

export async function postToGoogleChat(text: string): Promise<void> {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("Missing required env var: GOOGLE_CHAT_WEBHOOK_URL");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Google Chat webhook HTTP ${res.status}: ${await res.text()}`);
  }
}
