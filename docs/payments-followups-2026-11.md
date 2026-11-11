# Payments follow-ups (2026-11)

Follow-up to `docs/payments-hardening-2026-11.md`. It covers the three items that round left open: invoice pay-by-link, the refund and restore paths, and payment-proof uploads.

## Invoice pay-by-link (`app/api/invoice/[id]/pay/route.ts`, `lib/invoice-payment.ts`)

- The store's payment record is written before the gateway is asked for a session, and the session is saved on that record afterwards. Before, the session was created first and recorded after, so a failed save left a gateway session with no local record.
- A failed start is undone in one transaction: the reserved stock is released, the order is cancelled, and the draft is reopened. With no session, the record is marked failed. With a session, it stays pending, so a payment the gateway takes on it is matched. The order is cancelled, so the existing paid-after-cancel handling flags the payment for staff.
- The webhook matches a payment record that has no session id yet. It asks the gateway about the order by its number, and the gateway's answer decides.
- A completed invoice says "already paid" only when its order is paid. Otherwise the shopper is asked to contact the store.
- `completeDraftOrder` runs in one transaction that cannot run one step at a time.

## Refund and restore paths

- Every step that restores coins or gift cards runs in a transaction that cannot run one step at a time, after taking the order's row lock. This covers admin refunds, returns, return receipts, order edits, order cancellation, the expired-checkout job, failed online payments (the webhook and the return page), and checkout's payment-start failure.
- A manual or wallet refund is prepared and recorded in one transaction. Before, the refund row was committed before the credit and the restores, so a failure in between left a refunded row with no credit.
- A gateway refund is asked first, as before, and a refusal marks the refund failed, as before. Once the gateway has refunded, the refund is never marked failed. If the store cannot record it in one transaction, it stays pending, the response says so (202), and the audit log records `..._recording_failed`. It is recorded when the gateway confirms it, which relies on the gateway's webhook. A pending refund blocks a second refund of the same order, so nothing is refunded twice.
- Checkout's payment-start failure: the cancellation and the coin and gift-card restores are one transaction. Before, the cancellation committed first, so a failed restore lost the balances, because the expiry job only clears pending orders.
- The expiry job releases each order on its own. An order that cannot be released is counted as `failed` and tried on the next run.
- `routeError` and the refund and return routes answer an unavailable transaction with 503 and the retry message.

## Payment-proof uploads (`app/api/orders/payment-proof/route.ts`, `lib/payment-proof.ts`)

- The address limit is charged before the body is read.
- The body is read only up to the limit (`readProofForm`), whatever `Content-Length` says.
- The order limit is charged only once ownership is proved, so guessing order numbers cannot use up an order's allowance.
- The count returned is the one from the locked save.

## Not changed

- D2 (coins and free delivery), D3 (rate-limit numbers), D5 (webhook token in the URL), and whether invoice links expire are business or gateway decisions.
- The admin coin and store-credit adjustments (`app/api/admin/customers/[id]/coins` and `credit`) are manual balance changes, not restores. They still run in plain transactions.
- The proof save's lock is a plain transaction, because proofs are not money. During an outage, two concurrent uploads can pass the limit by one.
- A gateway refund that was accepted but not recorded waits for the gateway's webhook. If no webhook arrives, staff check it.

## Verification

- `npx tsc --noEmit`: exit 0.
- `npm test`: 1,076 passing, 0 failing. This includes 16 new tests in `tests/payments-followups.test.ts`.
- `npm run backend:audit`: passed.
- Production build against the scratch database: exit 0.
- Live, production build on port 3100, scratch database:
  - Checkout: typed coins $103.00, use all coins $5.00, coins plus gift card $53.00. The button and the charge match in all three. Five concurrent checkouts under one key made one order and one checkout transaction. A stale total returned 409 `TOTAL_CHANGED` and created no transaction.
  - Payment proof: a wrong email returned 404 and charged no order allowance. The right email on a non-transfer order returned 400, charged one allowance, and stored no file. An upload over 5 MB returned 413 with `Content-Length`, and again chunked (no `Content-Length`; the request was confirmed chunked). A small chunked form parsed.
  - Server log: no errors.

## Not verified live

- The invoice online payment. It needs a gateway, and the scratch store uses the manual provider.
- The refund, return and order-edit paths. They need an admin sign-in with the recent-confirmation check, and a gateway refund for the gateway paths.
- Proof storage itself, which needs the R2 binding.
- Checkout's payment-start failure and the 503 responses. The unit tests cover them.
