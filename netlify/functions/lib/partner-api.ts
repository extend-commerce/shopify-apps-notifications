const API_VERSION = "2026-04";

const EVENT_TYPES = [
  "RELATIONSHIP_INSTALLED",
  "RELATIONSHIP_UNINSTALLED",
  "RELATIONSHIP_REACTIVATED",
  "RELATIONSHIP_DEACTIVATED",
  "SUBSCRIPTION_CHARGE_ACTIVATED",
  "SUBSCRIPTION_CHARGE_CANCELED",
  "SUBSCRIPTION_CHARGE_FROZEN",
  "SUBSCRIPTION_CHARGE_UNFROZEN",
  "SUBSCRIPTION_CHARGE_DECLINED",
  "SUBSCRIPTION_CHARGE_EXPIRED",
  "ONE_TIME_CHARGE_ACTIVATED",
];

const QUERY = `
  query GetAppEvents($appId: ID!, $occurredAtMin: DateTime!, $afterCursor: String) {
    app(id: $appId) {
      name
      events(
        types: [${EVENT_TYPES.join(", ")}]
        occurredAtMin: $occurredAtMin
        first: 50
        after: $afterCursor
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          type
          occurredAt
          ... on RelationshipInstalled {
            shop { name myshopifyDomain }
          }
          ... on RelationshipUninstalled {
            reason
            shop { name myshopifyDomain }
          }
          ... on RelationshipReactivated {
            shop { name myshopifyDomain }
          }
          ... on RelationshipDeactivated {
            shop { name myshopifyDomain }
          }
          ... on SubscriptionChargeActivated {
            shop { name myshopifyDomain }
            charge { name amount { amount currencyCode } }
          }
          ... on SubscriptionChargeCanceled {
            shop { name myshopifyDomain }
          }
          ... on SubscriptionChargeFrozen {
            shop { name myshopifyDomain }
          }
          ... on SubscriptionChargeUnfrozen {
            shop { name myshopifyDomain }
          }
          ... on SubscriptionChargeDeclined {
            shop { name myshopifyDomain }
          }
          ... on SubscriptionChargeExpired {
            shop { name myshopifyDomain }
          }
          ... on OneTimeChargeActivated {
            shop { name myshopifyDomain }
            charge { name amount { amount currencyCode } }
          }
        }
      }
    }
  }
`;

export interface AppEventNode {
  type: string;
  occurredAt: string;
  shop: { name: string; myshopifyDomain: string };
  reason?: string;
  charge?: { name: string; amount: { amount: string; currencyCode: string } };
}

export interface FetchedEvent extends AppEventNode {
  appName: string;
}

interface AppEventsResponse {
  data?: {
    app: {
      name: string;
      events: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: AppEventNode[];
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

export async function fetchAppEvents(appId: string, occurredAtMin: string): Promise<FetchedEvent[]> {
  const orgId = requireEnv("SHOPIFY_PARTNER_ORG_ID");
  const token = requireEnv("SHOPIFY_PARTNER_ACCESS_TOKEN");
  const endpoint = `https://partners.shopify.com/${orgId}/api/${API_VERSION}/graphql.json`;

  const events: FetchedEvent[] = [];
  let afterCursor: string | null = null;

  while (true) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { appId, occurredAtMin, afterCursor },
      }),
    });

    if (!res.ok) {
      throw new Error(`Partner API HTTP ${res.status} for app ${appId}: ${await res.text()}`);
    }

    const json = (await res.json()) as AppEventsResponse;
    if (json.errors?.length) {
      throw new Error(`Partner API error for app ${appId}: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    if (!json.data?.app) {
      throw new Error(`App ${appId} not found or inaccessible`);
    }

    const appName = json.data.app.name;
    const page = json.data.app.events;
    for (const node of page.nodes) {
      events.push({ ...node, appName });
    }

    if (!page.pageInfo.hasNextPage) break;
    afterCursor = page.pageInfo.endCursor;

    // stay well under the 4 req/sec partner API rate limit
    await sleep(300);
  }

  return events;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
