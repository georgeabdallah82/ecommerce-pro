# Production operations

## Runtime topology

The production application is deployed as a Cloudflare Worker (via `@opennextjs/cloudflare` / `npm run deploy`) at https://yallahaul.com (and www, which redirects to it). The database is Neon PostgreSQL, reached through Prisma's Neon driver adapter (`lib/prisma.ts`; each request's connections are closed when it ends). The Worker reads `NEON_DATABASE_URL`; the deploy job uploads it with each version from the GitHub secret of the same name.

There is no runtime dependency on Netlify, Render, MongoDB or Prisma Accelerate. All were used earlier in this project's history; the store moved from MongoDB to Neon PostgreSQL on 2026-10-09 (every table copied and verified, then switched over).

## Checkout

Checkout is server-authoritative: prices, coupons, shipping, tax, and inventory are recalculated on the server. Duplicate cart lines are merged before stock validation. Clients should send a stable `X-Idempotency-Key` for retries; the checkout endpoint returns the existing order when the same key is reused.

## Tax

Admin > Tax manages per-country tax rates (`TaxRate`), the same shape as Shipping's zones: a name, a comma-separated list of ISO country codes (or `*` for a fallback zone), a percent rate, and active/inactive. At checkout, `lib/pricing.ts`'s `getTaxRatePercent(country)` resolves in this order: an active zone whose country list contains the destination country, then an active `*` wildcard zone, then Settings > Shipping's "Default tax rate" field (the original single global rate, kept as the ultimate fallback so upgrading never silently drops an already-configured rate to 0%). Zones take priority over that fallback the moment any are configured.

## Inventory

- Variant inventory is used when dedicated rows exist.
- If a variant has no dedicated inventory rows, product-level rows act as the shared inventory pool.
- `trackInventory=false` skips reservation.
- `continueSellingWhenOutOfStock=true` skips reservation.
- Reservations are recorded as inventory movements and are released on cancellation or expiration.
- Shipping/delivery fulfillment converts reservations into stock deductions.
- `InventoryItem.locationId` is a real foreign key to `StoreLocation` (managed in Admin > Operations), not a free-text field. Inventory transfers and purchase order receiving move stock by matching `locationId`, not by name, so renaming a location no longer silently orphans the inventory rows tagged with its old name.

## Expired reservations

Cloudflare Workers don't support scheduled tasks inside the main app worker, so cleanup runs as its own small Worker with a Cron Trigger: `workers/release-expired-reservations/`. It runs every 10 minutes (UTC) and calls:

`GET /api/internal/release-expired-reservations`

with:

`Authorization: Bearer $CRON_SECRET`

To deploy it: `cd workers/release-expired-reservations && npx wrangler secret put CRON_SECRET && npx wrangler secret put SITE_URL && npx wrangler deploy`. `SITE_URL` is the production site's canonical HTTPS URL; `CRON_SECRET` must match the main app's `CRON_SECRET`. It fails loudly (throws, visible in the Worker's logs) on missing configuration, upstream non-2xx responses, or timeouts.

It calls the main app through a `MAIN_APP` service binding (declared in this worker's `wrangler.jsonc`, pointing at the main app worker's `name` from the root `wrangler.jsonc`), not a plain `fetch()` to its public URL — Cloudflare blocks Worker-to-Worker fetches over `*.workers.dev` subdomains by default (surfaces as `error code: 1042` / HTTP 404), and a service binding routes directly between the two workers without hitting that restriction. If the main app worker's `name` in `wrangler.jsonc` ever changes, update the `service` value in this worker's binding to match.

## Payment integration

The app keeps payment processing provider-neutral. A trusted gateway can call `POST /api/internal/payment-status` with:

- `Authorization: Bearer $PAYMENT_WEBHOOK_SECRET`
- `orderId`
- `status` (`UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`, or `PARTIALLY_REFUNDED`)
- `amount` for successful payments
- `externalId` for webhook idempotency
- optional `provider`

The endpoint rejects mismatched successful amounts, ignores stale status updates, and ignores duplicate external transaction IDs.

## Transactional email

Order confirmations and password reset emails are sent through [Resend](https://resend.com)'s HTTP API (`lib/email.ts`), chosen because Cloudflare Workers cannot open raw SMTP sockets. Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender address/domain in the Resend dashboard) to enable sending. In production `EMAIL_FROM` is in `wrangler.jsonc` `vars` (`Yalla Haul <orders@yallahaul.com>`; yallahaul.com is verified in Resend), and `RESEND_API_KEY` is a Worker secret: set in the Cloudflare dashboard, or kept as the `RESEND_API_KEY` GitHub Actions secret, which the deploy job uploads with each version (left out when that secret is empty, so a dashboard-set key is never overwritten); without them, `lib/email.ts` logs a warning and no-ops instead of failing the request that triggered it — checkout and password reset both work regardless, they just won't email anyone until these are configured.

- Order confirmation sends once a payment method's order is truly placed: immediately for COD, bank transfer, and wallet orders, and on the `PAID` webhook event for card orders. It respects the "Order confirmation" toggle in Admin → Settings → Email (`email.customerOrder`, enabled by default).
- Password reset emails send unconditionally when `APP_URL`/`NEXT_PUBLIC_SITE_URL` is set, independent of that toggle (a security-relevant flow, not a marketing one).
- "Fulfillment / tracking" (`email.fulfillment`): `sendFulfillmentEmail` goes out when an order is marked shipped/fulfilled from the admin (with its tracking details).
- "Abandoned checkout recovery" (`email.abandonedCheckout`): `sendAbandonedCheckoutEmail` sends the "pick up where you left off" email with the cart-restoring link. It is sent by staff from Admin → Abandoned checkouts (not on a timer); the toggle turns that sending off entirely.

## Customer notifications (web push)

A few seconds after a visitor opens the store, a small box asks whether they want offers and order updates (`components/push-opt-in.tsx`; rules in `lib/push-opt-in.ts`). The browser's own permission prompt only appears after they tap **Yes**. "Not now" hides the box for 30 days. It never shows in the admin, on checkout, or on Account → Notifications, which has its own switch.

- **Who can sign up:** anyone; no account is needed. Devices are saved in the `PushSubscription` table by the public `/api/push/subscribe` endpoint. That endpoint is rate limited and only accepts real push-service addresses. A signed-in customer's device is linked to their account.
- **Sending:** Admin → Push campaigns sends to every saved device. A device whose push service answers 404/410 is deleted automatically.
- **Admin controls:** the same page has the "Ask visitors on the website" switch (setting `push.askVisitors`, on unless set to `false`) and the number of devices a campaign reaches.
- **Staff alerts are separate:** staff order alerts still use Setting rows (`push.subscription.*`).
- **iPhone:** iPhone Safari only supports web push for sites added to the Home Screen as an app. The popup stays hidden wherever the browser lacks the Push API.

## Outbound webhooks

Admin → Operations lets a store owner register endpoints (`WebhookEndpoint`) for `order.created`, `order.updated`, `order.fulfilled`, `product.updated`, `inventory.updated`, and `customer.created`. `lib/webhooks.ts`'s `dispatchWebhookEvent(topic, payload)` fires on the matching real-world action (order placed, admin order status change, product save, inventory adjustment, customer registration) to every `ACTIVE` endpoint subscribed to that topic.

- Delivery is a single POST with body `{ topic, payload, sentAt }` and an `X-Webhook-Signature` header: HMAC-SHA256 of the raw request body, keyed with the endpoint's own secret (shown once at creation). Verify it by recomputing the same HMAC over the raw body.
- There is no retry queue — a failed delivery is recorded (`lastStatus`/`lastError`/`lastSentAt` on the endpoint) and dropped. An integrator whose endpoint has downtime needs to poll the relevant admin API to catch up rather than rely on redelivery.
- Dispatch is fire-and-forget from the caller's perspective (`void dispatchWebhookEvent(...).catch(...)`) so a slow or unreachable third-party endpoint never blocks checkout, admin saves, or registration.

## Admin order lifecycle

`/api/admin/orders/:id` supports authenticated order viewing and controlled status updates. Cancelling an order releases reservations. Moving an inventory-tracked order to `SHIPPED` or `DELIVERED` fulfills its reserved stock exactly once.

## Visitor analytics (Admin > Live visitors)

`components/visitor-tracker.tsx` reports each store page view and a heartbeat (every 45 s while the page is on screen) to `/api/analytics/visit`. One row per visit (`VisitorSession`, a visit ends after 30 minutes without activity) and one per page viewed (`VisitorPageView`). The admin page and the dashboard read them through `lib/visitor-report.ts`.

- **Not counted:** the admin, the theme editor preview, anyone signed in as staff, and robots (recognised by their User-Agent, `lib/visitor-agent.ts`).
- **Privacy:** no IP address and no GPS are stored. Kept: the page (without its query string), where the visitor came from (`lib/visitor-source.ts`), the approximate country and city Cloudflare reports, and the kind of device. The visit cookie `yh_sid` is random, HttpOnly and lasts 30 minutes; `yh_rv` (90 days) only says "came before".
- **Live map:** soft blue circles are visitors' APPROXIMATE places (the network's position rounded to about 10 km, `lib/visitor-map.ts`), never a street. Solid red pins are exact spots that shoppers chose to share at checkout ("Share my exact location") and who have not ordered yet (`AbandonedCheckout.pinLat/pinLng`, kept with the town and area they typed); only staff with the unfinished-checkouts permission receive them. Map tiles come from OpenStreetMap (attribution shown); the page's content-security-policy already allows https images.
- **Retention:** visits 90 days, page views 30 days; the daily job deletes older rows.
- **Database hours:** the admin page refreshes only while it is on screen. Pages stop reporting after 5 minutes without touch.

## Order-day alerts

Two alerts reach the owner on the phone (web push) and by email, switched on or off in Settings > Notifications > Order problems:

- **A customer could not place an order.** Sent from `app/api/checkout/route.ts` when an order fails with an unexpected error (not a normal "out of stock" or "wrong details" answer). At most one every 20 minutes; the text never carries customer details.
- **An order is waiting.** A new cash or transfer order not confirmed after N minutes (default 60, 0 = never). No reminders from 11 pm to 8 am store time; they wait for the morning.

The waiting-order check costs no database hours when nothing is waiting. Checkout writes a small marker file (`ops/order-watch.json`, in the media bucket, never public) when an order arrives. The Worker's 15-minute cron (`wrangler.jsonc` "triggers") reads only that file; only if it says "watching" and it is daytime does it call `/api/internal/order-watch`, which asks the database. The daily job re-arms the watch if an order is waiting, in case the marker file was lost. Rules: `lib/order-watch.ts`.

## Health check

`GET /api/health` is the production health endpoint. It runs one tiny database query (timing out after 8 s) and returns HTTP `200` with `{ ok: true }` when the app and database are healthy, or HTTP `503` when the database is unreachable or too slow. Each call wakes the Neon database if it was asleep (Neon's free plan counts compute hours), so an uptime monitor should call it about hourly and check `/robots.txt`, which needs no database, every few minutes.

## Monitoring

- **Site down:** Better Stack (free plan, the owner's account) checks `https://yallahaul.com/robots.txt` every 3 minutes (no database) and `https://yallahaul.com/api/health` every 30 minutes (wakes the database, so not more often), and emails the owner when either fails.
- **Database hours:** `.github/workflows/neon-usage.yml` runs `scripts/neon-usage.ts` every morning (08:41 Beirut). It reads the store project's compute hours for the current period from the Neon API and fails, so GitHub emails the owner, once 70% of the free plan's 100 hours are used, or earlier when the pace would use them up before the period ends. It needs the `NEON_API_KEY` GitHub Actions secret (Neon Console → Account settings → API keys). When it fires: move Neon to the Launch plan (pay per use) or reduce what keeps the database awake.
- **Backups:** below. Failed scheduled runs of either workflow email the owner through GitHub.
- **Website status page:** Admin → Website status (`/admin/website-status`, owner only: `settings.manage`) shows all of it in one place, each card loading on its own (`lib/website-status.ts`):
  - Database: size against Neon Free's 1 GB, biggest tables, orders/customers/admin changes, latest admin activity, and the database hours from the last daily check's log.
  - Backups: when the last nightly copy was made, its size and whether its restore check passed, from that run's log.
  - Website & hosting: Worker requests and errors per day and this month (Cloudflare GraphQL analytics), image storage in R2 (`MEDIA_BUCKET`), and when this version went live (`CF_VERSION_METADATA`).
  - Emails: sent / failed / not sent, from the `EmailLog` table that `lib/email.ts` writes on every attempt, against Resend Free's 100 a day and 3,000 a month.
  - Uptime: each Better Stack monitor's state and 30-day uptime.
  - GitHub: the last deploy, backup and database-hours runs.

  The read-only keys it uses are GitHub Actions secrets that the deploy job uploads to the Worker (each left out while unset; that card then says "Not connected yet"):
  - `STATUS_GITHUB_TOKEN`: a fine-grained token for this repository only, with "Actions: Read".
  - `CLOUDFLARE_STATUS_TOKEN`: an API token with only "Account Analytics: Read"; together with `CLOUDFLARE_ACCOUNT_ID`.
  - `BETTERSTACK_API_TOKEN`: an Uptime API token.

  `NEON_API_KEY` and the deploy token (`CLOUDFLARE_API_TOKEN`) deliberately never go to the Worker: either could delete things.

## Backups

`.github/workflows/database-backup.yml` copies the whole database every night (03:17 Beirut) with `pg_dump`, restores the copy into a throwaway PostgreSQL in the same run and compares the row count of every table with the live database, then keeps it in the private R2 bucket `ecommerce-pro-backups` (`yallahaul-YYYY-MM-DD.dump`; a lifecycle rule deletes copies older than 30 days). A failed run emails the owner through GitHub. It can also be started by hand (Actions → Database backup → Run workflow). Neon's own instant restore covers only the last 6 hours on the free plan.

To restore: `npx wrangler r2 object get ecommerce-pro-backups/yallahaul-YYYY-MM-DD.dump --remote --file backup.dump`, then `pg_restore --no-owner --no-privileges -d <new database> backup.dump` into a new Neon branch or database, and only switch the store to it after checking it.

## Database in production

Production startup/build configuration rejects a missing or unconfigured `DATABASE_URL` in production — `lib/prisma.ts` throws instead of silently falling back to in-memory mock data (that fallback, including its seeded demo admin account, is only ever reachable outside production). The application therefore cannot silently serve fake data if the database client fails to initialize.

## Media uploads (R2)

Cloudflare Workers has no writable/persistent local filesystem, so the admin "Add file" upload flow (`POST /api/admin/media/upload`) stores images in an R2 bucket bound as `MEDIA_BUCKET` in `wrangler.jsonc`, and serves them back through `GET /api/media/[key]` (R2 objects have no public URL of their own without a custom domain on the bucket). Outside Workers — plain `next dev` with no R2 binding available — it falls back to writing into `public/uploads`, since a real filesystem exists there; that fallback throws instead in production if the binding is missing, the same fail-loud pattern used for a missing `DATABASE_URL`.

The R2 bucket itself must be created once before the first deploy (a `wrangler.jsonc` binding referencing a bucket that doesn't exist yet fails `wrangler deploy`):

```
npx wrangler r2 bucket create ecommerce-pro-media
```

No separate secret is needed — R2 bindings are declared in `wrangler.jsonc`, not set via `wrangler secret put`.

## SEO and security

- `/robots.txt` excludes admin, API, and account paths.
- `/sitemap.xml` is generated dynamically from active products and published content.
- Security response headers are configured in `next.config.ts`.
- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS site URL.
- Set strong generated values for `AUTH_SECRET`, `CRON_SECRET`, and `PAYMENT_WEBHOOK_SECRET`.

## Cloudflare Worker secrets

Cloudflare Workers don't share environment variables with any other platform — nothing carries over automatically from a previous Netlify or Render deployment. Set each of these with `npx wrangler secret put <NAME>` (run from the repo root, so it targets the main app worker configured in `wrangler.jsonc`):

- `NEON_DATABASE_URL` — not set here: the deploy job uploads it with each version from the `NEON_DATABASE_URL` GitHub Actions secret (the Neon pooled connection string). Migrations run against the direct (non-pooled) address in the same job, before the new version goes live.
- `AUTH_SECRET`
- `CRON_SECRET` (must match what's set on the `release-expired-reservations` worker above)
- `PAYMENT_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY` and `EMAIL_FROM` — optional but recommended; without them, order confirmation and password reset emails silently no-op (see "Transactional email" above)
- Other configured payment, notification, branding, and admin variables used by the application (see `.env.example`)

Non-secret `NEXT_PUBLIC_*` build-time values can instead go in `wrangler.jsonc`'s `vars` if preferred, since they aren't sensitive.

## Automatic deploy on merge to main

`.github/workflows/ci.yml`'s `deploy` job runs `npm run deploy` (which builds and runs `wrangler deploy`) after the `quality` job passes, on every push to `main`. There is no other deploy trigger — merging a PR does not deploy anything on its own; it only reaches the live site once this job runs on `main`.

This job needs its own GitHub Actions repo secrets (Settings → Secrets and variables → Actions), separate from the Cloudflare Worker secrets above:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with Workers Scripts (Edit) and Workers R2 Storage (Edit) permissions for this account. Create one at the Cloudflare dashboard under My Profile → API Tokens.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID that owns the `ecommerce-pro` Worker (shown on the Cloudflare dashboard's Workers & Pages overview). Only strictly required if the API token has access to more than one account, but harmless to always set.

Without `CLOUDFLARE_API_TOKEN` set, the `deploy` job fails fast with a clear error instead of silently no-opping.

## Before final production sign-off

1. Set the `NEON_DATABASE_URL` GitHub Actions secret to the Neon pooled connection string.
2. Set the remaining secrets listed above via `wrangler secret put`.
2b. Set the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub Actions repo secrets so merges to `main` deploy automatically (see "Automatic deploy on merge to main" above).
3. Deploy with `npm run deploy` and confirm it completes successfully.
4. Verify `GET /api/health` returns healthy (the Neon database is reachable).
5. Verify `GET /api/products`, authentication/session, navigation, storefront settings, and the critical checkout read paths.
6. Test COD checkout with stock, shared inventory, variants, coupons, cancellation, and fulfillment.
7. Test payment webhooks with duplicate and out-of-order events.
8. Deploy `workers/release-expired-reservations/` and verify its Cron Trigger is enabled in the Cloudflare dashboard.
9. Verify `/robots.txt` and `/sitemap.xml` on the production domain.
10. Create the `ecommerce-pro-media` R2 bucket (`npx wrangler r2 bucket create ecommerce-pro-media`) before the first deploy, and verify an admin file upload from `/admin/media` round-trips (uploads, then loads back via its `/api/media/[key]` URL).
11. Set `RESEND_API_KEY` and `EMAIL_FROM`, then verify a real order confirmation and a real password reset email both arrive.
12. If this is an existing deployment with prior inventory data, run `scripts/backfill-inventory-locations.mjs` once (see "Inventory" above) to migrate legacy free-text locations onto real `StoreLocation` records.
