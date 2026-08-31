# Production operations

## Runtime topology

The production application is deployed as a single full-stack Next.js site on Netlify. Netlify serves the storefront and executes the Next.js Route Handlers/API routes. MongoDB Atlas is the production database. There is no runtime dependency on Render.

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

`netlify/functions/release-expired-reservations.mjs` is a Netlify Scheduled Function that runs every 10 minutes (UTC) and calls:

`GET /api/internal/release-expired-reservations`

with:

`Authorization: Bearer $CRON_SECRET`

The scheduled function fails loudly on missing configuration, upstream non-2xx responses, or timeouts. Netlify Scheduled Functions are available on all plans and use UTC cron expressions. citeturn546953search0turn546953search4

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

`GET /api/health` is the production health endpoint. It performs a lightweight MongoDB reachability check and returns HTTP `200` with `{ ok: true }` when the app and database are healthy, or HTTP `503` when the database is unreachable.

## MongoDB production runtime

Production startup/build configuration rejects non-MongoDB `DATABASE_URL` values on the Netlify production deployment. The application therefore cannot silently fall back to the old PostgreSQL runtime.

## SEO and security

- `/robots.txt` excludes admin, API, and account paths.
- `/sitemap.xml` is generated dynamically from active products and published content.
- Security response headers are configured in `next.config.ts`.
- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS site URL.
- Set strong generated values for `AUTH_SECRET`, `CRON_SECRET`, and `PAYMENT_WEBHOOK_SECRET`.

## Netlify environment variables

For the production site, sensitive server variables must be available to both the Netlify build and Functions/runtime scopes as appropriate. The critical production values are:

- `DATABASE_URL` — MongoDB Atlas `ecommerce_production` connection string
- `AUTH_SECRET`
- `CRON_SECRET`
- `PAYMENT_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- Other configured payment, notification, branding, and admin variables used by the application

## Before final production sign-off

1. Set Netlify `DATABASE_URL` to the production MongoDB database.
2. Verify server secrets are available to Netlify Functions/runtime and to the build where required.
3. Confirm the Netlify deploy completes successfully.
4. Verify `GET /api/health` returns healthy and MongoDB is reachable.
5. Verify `GET /api/products`, authentication/session, navigation, storefront settings, and the critical checkout read paths.
6. Test COD checkout with stock, shared inventory, variants, coupons, cancellation, and fulfillment.
7. Test payment webhooks with duplicate and out-of-order events.
8. Verify the scheduled reservation cleanup function is deployed and enabled.
9. Verify `/robots.txt` and `/sitemap.xml` on the production domain.
10. Keep the PostgreSQL source backup/database intact until the Netlify + MongoDB production runtime has been verified and signed off.
11. After sign-off, decommission the old Render service and PostgreSQL database.
