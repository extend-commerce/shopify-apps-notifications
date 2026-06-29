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

// NOTE: the live Partner API schema does not match shopify.dev's published docs here -
// AppEventConnection only has `edges { cursor node }`, not `nodes`, and PageInfo only has
// hasNextPage/hasPreviousPage (no endCursor) - confirmed via introspection against the
// production schema, since the docs were wrong.
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
        }
        edges {
          cursor
          node {
            type
            occurredAt
            ... on RelationshipInstalled {
              shop { name myshopifyDomain }
            }
            ... on RelationshipUninstalled {
              reason
              description
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
              charge { name amount { amount currencyCode } }
            }
            ... on SubscriptionChargeFrozen {
              shop { name myshopifyDomain }
              charge { name amount { amount currencyCode } }
            }
            ... on SubscriptionChargeUnfrozen {
              shop { name myshopifyDomain }
              charge { name amount { amount currencyCode } }
            }
            ... on SubscriptionChargeDeclined {
              shop { name myshopifyDomain }
              charge { name amount { amount currencyCode } }
            }
            ... on SubscriptionChargeExpired {
              shop { name myshopifyDomain }
              charge { name amount { amount currencyCode } }
            }
            ... on OneTimeChargeActivated {
              shop { name myshopifyDomain }
              charge { name amount { amount currencyCode } }
            }
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
  description?: string;
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
        pageInfo: { hasNextPage: boolean };
        edges: Array<{ cursor: string; node: AppEventNode }>;
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
    const json = await requestWithRetry(endpoint, token, appId, occurredAtMin, afterCursor);

    if (!json.data?.app) {
      throw new Error(`App ${appId} not found or inaccessible`);
    }

    const appName = json.data.app.name;
    const page = json.data.app.events;
    for (const edge of page.edges) {
      events.push({ ...edge.node, appName });
    }

    if (!page.pageInfo.hasNextPage || page.edges.length === 0) break;
    afterCursor = page.edges[page.edges.length - 1].cursor;

    // stay well under the 4 req/sec partner API rate limit
    await sleep(300);
  }

  return events;
}

const MAX_RETRIES = 4;

async function requestWithRetry(
  endpoint: string,
  token: string,
  appId: string,
  occurredAtMin: string,
  afterCursor: string | null,
): Promise<AppEventsResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterSeconds = Number(res.headers.get("Retry-After"));
      const backoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 500 * 2 ** attempt;
      await sleep(backoffMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(`Partner API HTTP ${res.status} for app ${appId}: ${await res.text()}`);
    }

    const json = (await res.json()) as AppEventsResponse;
    if (json.errors?.length) {
      const isRateLimited = json.errors.some((e) => e.message === "Too many requests");
      if (isRateLimited && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new Error(`Partner API error for app ${appId}: ${json.errors.map((e) => e.message).join("; ")}`);
    }

    return json;
  }

  throw new Error(`Partner API rate limit retries exhausted for app ${appId}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
