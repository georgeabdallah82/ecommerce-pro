# Production operations

## Runtime topology

The production application is deployed as a Cloudflare Worker (via `@opennextjs/cloudflare` / `npm run deploy`). Cloudflare Workers cannot open raw TCP connections to MongoDB, so the app connects through [Prisma Accelerate](https://www.prisma.io/data-platform/accelerate), an HTTPS-based connection proxy in front of MongoDB Atlas. `DATABASE_URL` in production must be an Accelerate connection string (`prisma://...`), not a direct `mongodb://` URL.

There is no runtime dependency on Netlify, Render, or PostgreSQL. Both were used earlier in this project's history; PostgreSQL was fully replaced by MongoDB, and Netlify was replaced by Cloudflare Workers.

## Checkout

Checkout is server-authoritative: prices, coupons, shipping, tax, and inventory are recalculated on the server. Duplicate cart lines are merged before stock validation. Clients should send a stable `X-Idempotency-Key` for retries; the checkout endpoint returns the existing order when the same key is reused.

## Inventory

- Variant inventory is used when dedicated rows exist.
- If a variant has no dedicated inventory rows, product-level rows act as the shared inventory pool.
- `trackInventory=false` skips reservation.
- `continueSellingWhenOutOfStock=true` skips reservation.
- Reservations are recorded as inventory movements and are released on cancellation or expiration.
- Shipping/delivery fulfillment converts reservations into stock deductions.

## Expired reservations

Cloudflare Workers don't support scheduled tasks inside the main app worker, so cleanup runs as its own small Worker with a Cron Trigger: `workers/release-expired-reservations/`. It runs every 10 minutes (UTC) and calls:

`GET /api/internal/release-expired-reservations`

with:

`Authorization: Bearer $CRON_SECRET`

To deploy it: `cd workers/release-expired-reservations && npx wrangler secret put CRON_SECRET && npx wrangler secret put SITE_URL && npx wrangler deploy`. `SITE_URL` is the production site's canonical HTTPS URL; `CRON_SECRET` must match the main app's `CRON_SECRET`. It fails loudly (throws, visible in the Worker's logs) on missing configuration, upstream non-2xx responses, or timeouts.

## Payment integration

The app keeps payment processing provider-neutral. A trusted gateway can call `POST /api/internal/payment-status` with:

- `Authorization: Bearer $PAYMENT_WEBHOOK_SECRET`
- `orderId`
- `status` (`UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`, or `PARTIALLY_REFUNDED`)
- `amount` for successful payments
- `externalId` for webhook idempotency
- optional `provider`

The endpoint rejects mismatched successful amounts, ignores stale status updates, and ignores duplicate external transaction IDs.

## Admin order lifecycle

`/api/admin/orders/:id` supports authenticated order viewing and controlled status updates. Cancelling an order releases reservations. Moving an inventory-tracked order to `SHIPPED` or `DELIVERED` fulfills its reserved stock exactly once.

## Health check

`GET /api/health` is the production health endpoint. It performs a lightweight MongoDB reachability check (through Accelerate) and returns HTTP `200` with `{ ok: true }` when the app and database are healthy, or HTTP `503` when the database is unreachable.

## MongoDB production runtime

Production startup/build configuration rejects a missing or unconfigured `DATABASE_URL` in production — `lib/prisma.ts` throws instead of silently falling back to in-memory mock data (that fallback, including its seeded demo admin account, is only ever reachable outside production). The application therefore cannot silently serve fake data if the database client fails to initialize.

## SEO and security

- `/robots.txt` excludes admin, API, and account paths.
- `/sitemap.xml` is generated dynamically from active products and published content.
- Security response headers are configured in `next.config.ts`.
- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS site URL.
- Set strong generated values for `AUTH_SECRET`, `CRON_SECRET`, and `PAYMENT_WEBHOOK_SECRET`.

## Cloudflare Worker secrets

Cloudflare Workers don't share environment variables with any other platform — nothing carries over automatically from a previous Netlify or Render deployment. Set each of these with `npx wrangler secret put <NAME>` (run from the repo root, so it targets the main app worker configured in `wrangler.jsonc`):

- `DATABASE_URL` — a Prisma Accelerate connection string (`prisma://...`) in front of the MongoDB Atlas production database. Create this via the [Prisma Data Platform](https://console.prisma.io): add the project, connect its origin to the MongoDB Atlas connection string, enable Accelerate, and copy the resulting `prisma://` URL.
- `AUTH_SECRET`
- `CRON_SECRET` (must match what's set on the `release-expired-reservations` worker above)
- `PAYMENT_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- Other configured payment, notification, branding, and admin variables used by the application (see `.env.example`)

Non-secret `NEXT_PUBLIC_*` build-time values can instead go in `wrangler.jsonc`'s `vars` if preferred, since they aren't sensitive.

## Before final production sign-off

1. Set the Cloudflare Worker's `DATABASE_URL` secret to the production Accelerate connection string.
2. Set the remaining secrets listed above via `wrangler secret put`.
3. Deploy with `npm run deploy` and confirm it completes successfully.
4. Verify `GET /api/health` returns healthy and MongoDB (through Accelerate) is reachable.
5. Verify `GET /api/products`, authentication/session, navigation, storefront settings, and the critical checkout read paths.
6. Test COD checkout with stock, shared inventory, variants, coupons, cancellation, and fulfillment.
7. Test payment webhooks with duplicate and out-of-order events.
8. Deploy `workers/release-expired-reservations/` and verify its Cron Trigger is enabled in the Cloudflare dashboard.
9. Verify `/robots.txt` and `/sitemap.xml` on the production domain.
