# Payments hardening (2026-11)

Follow-up to `docs/storefront-checkout-audit-2026-11.md`. It applies the recommended fixes for D1 and D4, locks payment-proof uploads, fixes the checkout cookie-banner overlap (D6), and audits the invoice pay-by-link and payment-proof routes. D2, D3 and D5 are business or gateway decisions and are unchanged.

## Changes

### D1: wallet and coin steps fail closed (applied)
- `lib/prisma.ts`: `runInteractiveTransaction` takes `requireTransaction`. With it set, the step-by-step fallback is never used. If the transaction cannot start, or the cool-down after a failed start is still running, it throws `TransactionUnavailableError` and nothing from the callback is kept.
- `app/api/checkout/route.ts`: a checkout that spends wallet or coins runs with `requireTransaction`. When the transaction is unavailable, the shopper gets a 503 with "The store could not complete this safely. Please try again in a moment."
- `app/api/payments/areeba/webhook/route.ts`: refund reconciliation, which restores coins, runs with `requireTransaction`. When it is unavailable the webhook returns 500, so the gateway retries.

### D4: refunds are confirmed with the gateway (applied)
- `lib/payments.ts`: `fetchGatewayOrder` is the one gateway read. `getPaymentStatus` and the new `areebaOrderRefunds` both use it.
- Webhook: reconciliation runs only for an order with a `refund_pending` transaction. Its status and refunded total come from the gateway. The webhook body's `order.status` and `order.totalRefundedAmount` are no longer read.

### Payment-proof limit race (applied)
- `app/api/orders/payment-proof/route.ts`: the save transaction locks the order row before it counts the proofs. Concurrent uploads for one order therefore wait for each other, and the limit (`MAX_PROOFS_PER_ORDER`, 3) holds.

### D6: the cookie banner stays clear of checkout's action (applied)
- `components/cookie-consent.tsx`: while the banner is open, its height is published as `--cookie-banner-height`. It is kept current with a ResizeObserver and window resizes.
- `app/checkout/checkout.module.css`: `.placeBar` is sticky at `bottom: calc(var(--cookie-banner-height, 0px) + 8px)`.

## Audit: invoice pay-by-link (`app/api/invoice/[id]/pay/route.ts`), no change

Sound: the token is compared with `safeTokenEqual`. The route is rate-limited at 10 attempts per 10 minutes per IP. The amount comes from the draft, never from the request. Completed and cancelled drafts are refused, and so is the manual provider. A double completion is blocked by the guarded update in `completeDraftOrder` (only `DRAFT` or `OPEN` drafts move to `COMPLETED`).

Findings, not changed:
1. The gateway session is created before the local `paymentTransaction` row is saved. If that save fails, the order is cancelled and the draft reopened, but the gateway session stays open. A payment made on it would have no local transaction, so the webhook cannot reconcile it. The window is narrow. Fix: save a pending transaction first, then create the session and store its `externalId`.
2. The compensation (release reservations, cancel the order, reopen the draft) runs in a plain transaction. When transactions are unavailable it can apply partly. A draft left `COMPLETED` is then reported as "This invoice has already been paid" for an unpaid invoice. Fix: make the compensation all-or-nothing, and show stuck drafts to staff.
3. Invoice links never expire, though the error text says "expired". Decide whether they should.

## Audit: payment proof (`app/api/orders/payment-proof/route.ts`), no further change

Sound: the file type is read from its magic bytes, not from its name or browser type. The size cap is 5 MB. Proofs are stored privately: in the private R2 bucket in production, and in a gitignored folder outside `public/` in development. Production refuses to store a proof without R2. A stored file is deleted if the request fails. Ownership is checked the same way as on the order page.

Findings, not changed:
1. The per-order limit (8 per hour) is charged before the order is verified. Anyone who knows an order number can use up its allowance, and the real customer is then blocked from uploading for an hour. Order numbers are sequential. Fix: charge the per-order limit only after `canViewOrder` passes.
2. The body size is checked from the `Content-Length` header only, and the form is parsed before any rate limit runs. A request without that header is read in full first. Fix: apply the IP limit before parsing, and cap the stream.
3. The count returned to the client comes from the earlier read, not from the locked count. This affects the display only.
4. The new lock is a plain transaction. When transactions are unavailable, concurrent uploads can exceed the limit.

## Fresh-database seed check

`prisma/seed.ts` creates the demo customer with `emailVerifiedAt` set, so the demo customer can sign in on a fresh database. The admin seed account has no verification timestamp. Admin sign-in does not need one, so this is left unchanged.

## Still open (decisions)
- D2, coins and free delivery: after "use all coins" on the audit cart, the total is $5.00, which is the delivery charge. Decide whether coins should count toward the free-delivery threshold.
- D3, rate limits: the checkout quote endpoint allows 120 requests per 10 minutes per IP. Confirm the number.
- D5, webhook token in the URL: move it to a header if the gateway supports one.

## Remaining D1 gap

The admin refund, return and order-edit routes, and `lib/returns.ts`, restore coins and gift-card balances inside plain transactions. They do not use `requireTransaction`, so in an outage they can apply partly. The audit recommended fail-closed for payments only, so this is a follow-up.

## Verification

- `npx tsc --noEmit`: exit 0.
- `npm test`: 1060 passing, 0 failing. This includes the 9 new tests in `tests/payments-hardening.test.ts`.
- `npm run backend:audit`: passed (116 admin API files and 176 API files scanned).
- Production build against the scratch database: exit 0.
- Local production server (port 3100, scratch database):
  - Phone width 390 × 844, banner open: banner top 679 px, Place order bar bottom 671 px (844 px viewport, minus the 165 px the banner takes, minus 8 px), button 553–607 px. After Accept, the banner and the variable are gone and the bar returns to its place.
  - Checkout runs: typed 10,000 coins, total $103.00 shown and charged. Use all coins, $5.00 shown and charged. Coins plus the audit gift card, $53.00 shown and charged.
  - Five concurrent checkouts with one idempotency key created one order and one checkout transaction.
  - A stale expected total returned 409 `TOTAL_CHANGED` and created no transaction. The correct total returned 201. A retry under that key, with the stale total, returned 200, the answer for an order already placed under the key.
  - The server log has no errors.

## Not verified live
- Payment-proof concurrency. The local server runs in production mode, which needs the R2 binding to store a proof, so only the static test covers the lock.
- Refund reconciliation through the gateway. This needs the gateway.
- The 503 response for wallet and coin checkout when transactions cannot start. Only the unit tests cover it.
