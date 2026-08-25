# Production operations

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

Call `GET /api/internal/release-expired-reservations` periodically with:

`Authorization: Bearer $CRON_SECRET`

The endpoint checks pending orders older than 30 minutes and releases their checkout reservations. Configure a Render Cron Job or another scheduler to call it every 5–10 minutes if your Render plan supports scheduled jobs.

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

`GET /api/health` is the Render web-service health endpoint. It performs a lightweight PostgreSQL reachability check and returns HTTP `200` with `{ ok: true }` when the app and database are healthy, or HTTP `503` when the database is unreachable.

## SEO and security

- `/robots.txt` excludes admin, API, and account paths.
- `/sitemap.xml` is generated dynamically from active products and published content.
- Security response headers are configured in `next.config.ts`.
- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS site URL.
- Set strong generated values for `AUTH_SECRET`, `CRON_SECRET`, and `PAYMENT_WEBHOOK_SECRET`.

## Before going live

1. Set `NEXT_PUBLIC_SITE_URL`.
2. Set all production secrets in Render.
3. Verify `DATABASE_URL` points to the production database.
4. Confirm Render health checks `/api/health` successfully after deployment.
5. Run the CI build/typecheck successfully.
6. Test COD checkout with stock, shared inventory, variants, coupons, cancellation, and fulfillment.
7. Test payment webhooks with duplicate and out-of-order events.
8. Configure the reservation cleanup scheduler.
9. Verify `/robots.txt` and `/sitemap.xml` on the production domain.
