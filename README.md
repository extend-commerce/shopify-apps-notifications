# Shopify App Events → Google Chat

Polls the Shopify Partner API every 2 minutes for app events (installs, uninstalls,
subscription changes, one-time charges) and posts them to a Google Chat space via
an Incoming Webhook. Runs as a scheduled Netlify Function; state (`lastCheckedAt`
and a dedup key set) is persisted in Netlify Blobs between runs.

## Setup

1. **Partner API token**: Partners Dashboard → Settings → Partner API clients →
   create a client with "Manage apps" permission. Copy the access token and the
   org ID from the dashboard URL (`partners.shopify.com/{org-id}/...`).
2. **App IDs**: for each app you want to monitor, open it in the Partners
   Dashboard and copy the ID from the URL (`gid://partners/App/...`).
3. **Google Chat webhook**: in the target space → space name → Apps & integrations
   → Add webhooks → copy the URL.
4. Copy `.env.example` to `.env` for local dev, or set these as environment
   variables in the Netlify site settings:
   - `SHOPIFY_PARTNER_ORG_ID`
   - `SHOPIFY_PARTNER_ACCESS_TOKEN`
   - `SHOPIFY_APP_IDS` (comma-separated)
   - `GOOGLE_CHAT_WEBHOOK_URL`

## Deploy

```
netlify init   # link this directory to a Netlify site
netlify deploy --prod
```

The function `poll-app-events` runs on its own schedule (`*/2 * * * *`, defined
in `netlify/functions/poll-app-events.ts`) once deployed to production — it does
not run on deploy previews or branch deploys.

## Notes / known limitations

- The Shopify Partner API exposes no field for which user performed an action,
  so notifications omit a "by {email}" line — only app, shop, domain, and event
  details are available.
- The `*/2 * * * *` cron interval is finer than Netlify's officially documented
  minimum (`@hourly`), but works in practice today. If Netlify ever stops
  honoring sub-hourly schedules, this function will simply stop firing silently
  — worth periodically confirming notifications are still arriving.
- On first run (empty state), the poller looks back 5 minutes to avoid flooding
  the space with historical events.
