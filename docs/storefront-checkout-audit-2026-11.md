# Storefront checkout and payments audit, November 2026

Scope: the storefront checkout from cart to order (`app/checkout`, `app/api/checkout/**`), the coin and gift card redemption it applies, the payment callbacks (`app/api/payments/areeba/**`), and the libraries behind them (`lib/checkout-*.ts`, `lib/pricing.ts`, `lib/discounts.ts`, `lib/gift-cards.ts`, `lib/payment-outcome.ts`).

Method: read the checkout route, the order-placement and discount libraries, the payment callbacks, the database client's transaction handling, and the checkout page. Each finding was reproduced before any change, against the production build on a scratch Postgres 16 database (`ecommerce_checkout_audit`, seeded by `prisma/seed.ts`), using headless Chromium and HTTP. Then the fixes were made and measured again on the same database. No database migration is needed: the schema is unchanged.

## Summary

- **The total on the Place order button could differ from the charge.** With coins that take the merchandise under the free-delivery threshold, the button showed $98.00 and the order charged $103.00. Fixed: checkout and the price summary now share one money calculation, and checkout refuses an order at any total the shopper did not see.
- **Five identical checkouts created three orders.** Requests that share an idempotency key were not serialized. Fixed with a lock on the key inside the transaction: five now create one order.
- **The coin field allowed more coins than the order could take.** "Use all" showed −$102.00, and the order was then refused. Fixed: coins are capped to what the order can take, and the cap is shown.
- **Gift cards were not in the total.** Fixed: the summary applies the gift card and shows it.
- **Place order was enabled while the price was loading or had failed.** Fixed.
- **Rate limits for the price summary and the payment callbacks lived in each server instance's memory.** Moved to the shared limiter.
- **Found in setup:** the seeded demo customer was not verified, so the documented demo sign-in redirected to "check your email". Fixed in `prisma/seed.ts`.

## Fixed in this branch

| ID | Severity | Finding | Evidence before | Fix | Measured after |
|---|---|---|---|---|---|
| C1 | High | Button total differs from the charge when coins take the merchandise under the free-delivery threshold | Button $98.00; server charged 10300 ($103.00), HTTP 201 | `lib/checkout-totals.ts` (`orderMoney`) is used by both checkout and the price summary. The summary takes `coinsToUse`, and the page shows the server's total. Checkout accepts an optional `expectedTotal` and answers `409 TOTAL_CHANGED` if the total differs, before the order number is taken. | Button $103.00; charged $103.00 (HTTP 201) |
| C2 | High | Five identical checkouts with one idempotency key created three orders | Five concurrent requests: 201, 201, 201, 200, 200; three orders (1002, 1003, 1004) | `pg_advisory_xact_lock` on the key, taken inside the transaction before the existing-order lookup | 201, 200, 200, 200, 200; one order and one checkout transaction |
| C3 | Medium | Coin field not capped to what the order can take; the button showed a negative total | "Use all" with 30,000 coins on a $198.00 cart: button −$102.00; POST answered 400 "Coin redemption exceeds the merchandise total." | The price summary returns `maxCoins` (the balance or the merchandise total, whichever is less). The field clamps to it, "Use all" sets it, and a coin error shows under the field. | "Use all" on the same cart: button $5.00; charged $5.00 (HTTP 201) |
| C4 | Medium | Gift card missing from the button total and the summary | Not measured before. By reading the code, the old button had no gift card term, so it could not match the charge. | The summary validates and applies the gift card with `giftCardProblem` (the same reasons checkout gives), shows a "Gift card" line, and reads "Gift card ending 9Q2M applied" | Coins $100 plus a $50 gift card on $198.00: button $53.00; charged $53.00 (HTTP 201) |
| C5 | Medium | Place order enabled while the price was loading or had failed | By reading the code: the button depended only on settings and the cart | Disabled until a current price is in hand; shows "Calculating total…" or "Updating total…"; a failed price shows "Try again". Delivery methods show the server's price for the selected method. | The browser check waits for the enabled button after every price change |
| C6 | Low–medium | The price summary and the payment callbacks used in-memory rate limits, which are per worker instance on Cloudflare | By reading the code | Durable limiter (`consumeDurableRateLimit`): price summary 120 per 10 minutes per IP; return 20 per order per minute; webhook 60 per minute per IP | Static tests; not load-tested |
| C7 | Low | Demo customer created unverified, so the documented demo sign-in redirected to "check your email" | Browser on a fresh seed: sign-in landed on `/account/check-email` | `prisma/seed.ts` sets `emailVerifiedAt` when it creates the demo customer | The scratch database was verified by setting the same field by hand. The seed change itself has not been run on a fresh database. |

## Decisions for you (not changed)

- **D1, money paths without a transaction.** When the transaction machinery fails, `lib/prisma.ts` runs the steps one at a time without a transaction. In that window the wallet and coin locks and the new idempotency lock do not hold. Options: fail checkout closed with a retry message in that window, or keep today's availability. Recommendation: fail closed for wallet and coin payments only.
- **D2, coins and delivery.** Delivery is priced on the merchandise left after coins, so coins can bring back a $5.00 delivery charge on a $198.00 cart. The summary now shows that figure. Decide whether coins should count toward the free-delivery threshold.
- **D3, rate-limit numbers.** The price summary allows 120 requests per 10 minutes per IP, because many shoppers share a mobile carrier's address. Confirm the number.
- **D4, refund reconciliation.** The payment webhook takes the refunded amount from its body when it reconciles a refund, and the URL token is the only check. Payments are confirmed with the gateway; refunds should be confirmed the same way.
- **D5, webhook token in the URL.** The token travels in the query string, which proxies and logs can record. Use a header if the gateway supports one.
- **D6, cookie banner on checkout.** On a phone, the consent banner covers the Place order button and the line under it. It is a shared component, so the decision is whether checkout keeps the banner clear of the action, or the banner collapses to a bar there.

## Checked and fine

- Prices come from the database; the client's prices are ignored.
- Coupons, gift cards and coins are applied with conditional updates or a locked ledger, with an undo chain when a later step fails.
- The payment return link is signed with the order number. The webhook is token-checked. Both confirm the payment with the gateway and check the amount and currency before marking an order paid.
- The payment return redirect stays on the store's own origin.
- Checkout body limit 100 KB, schema validation, the delivery country list, and blocked numbers.
- The price summary reveals coupon wording, as checkout does, by design. Gift card codes are random 80-bit values, so guessing them is not practical.
- Compatibility: `expectedTotal` is optional, so a page built before this change still places orders. An old page never sends coins or a gift card to the summary, so its figures are unchanged.

## Backlog (not in this branch)

- `checkoutFailure` keeps a message whitelist that repeats the typed errors. Passing `UserError` messages through would remove the duplication. This is maintenance, not a defect.
- `restoreGiftCardBalance` and the coin reversal use a check-then-act pattern. They are safe only inside a real transaction (see D1).
- The checkout's labels and error association for assistive technology were not reviewed in depth.

## Verification

- `npx tsc --noEmit`: clean.
- `npm test`: 1051 tests, 0 failing. This includes 20 new or updated checks in `tests/checkout-totals.test.ts` and `tests/i18n.test.ts`. The new Arabic strings are covered by the existing translation test.
- `npm run backend:audit`: passed.
- Production build (`npm run build`), served with `next start`, against the scratch database.
- Browser (headless Chromium): the three price scenarios above. For each, the figure on the button was compared with the total the server returned for the order.
- HTTP: five identical concurrent checkouts (one order); a stale total (`409 TOTAL_CHANGED`, no transaction created); the correct total (`201`); a retry of that key with the stale total (`200`, the existing order returned).
- Before-state measurements came from the pre-change build on the same database. The browser and HTTP scripts were scratch files, not committed.
