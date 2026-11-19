# Money: tests for order totals and refunds, and free delivery counted once (November 2026)

Branch `claude/money-tests`, based on `origin/main` at 411a3d7 (after #638). A first-month item from the backend audit.

## What was wrong

- **Two money functions had no tests:**
  - `orderMoney` (`lib/checkout-totals.ts`) works out every order's coins, delivery, tax, gift card and total;
  - `refundOutcome` (`lib/refund-reconciliation.ts`) decides whether a refund the payment gateway made is full or partial.

  Discounts, delivery prices, returns and gift cards already had tests that check real values.
- **Nothing checked a real order's figures from start to finish.**
- **The new checks found a bug: an order with a free-delivery code counted the delivery twice.**
  - Checkout kept no delivery charge, and also added the waived delivery to the discount.
  - So the order's figures came to less than its total, by the delivery. A $99.00 order kept "subtotal 99.00, discount 5.00, delivery 0, total 99.00".
  - The confirmation email and the invoice showed a $5.00 discount the shopper never saw.
  - An order edit works the total out as subtotal - discount + delivery + tax, so it would have made the order $5.00 less.

## What changed

1. **The order keeps the figures the price summary showed** (`orderRecordTotals` in `lib/checkout-totals.ts`, used by `app/api/checkout/route.ts`).
   - That is the subtotal, the discount (merchandise discount, coins and gift card), the delivery charged, tax and the total, which always add up.
   - A free-delivery code is kept as no delivery charge.
2. **`tests/checkout-money.test.ts` adds 13 tests.**
   - **What checkout charges:**
     - delivery and tax, with tax rounding and the taxable part;
     - coins: capped, with delivery priced before them;
     - a free-delivery code, and a cart with nothing to deliver;
     - a gift card, applied after delivery and tax and never below zero.
   - **What the order keeps adds up** for every mix of merchandise discount, free delivery, coins, gift card and tax: 72 orders.
   - **How a gateway refund settles:**
     - full or partial;
     - dollars to exact cents;
     - waiting while the gateway has refunded less than the store counts;
     - an amount that is not a number.
3. **The CI browser test** (`scripts/e2e/write-path.mjs`) places two more orders, one with a 10% code and one with a free-delivery code.
   - `postgres-staging` runs it against PostgreSQL, on Cloudflare's runtime.
   - The orders are sent the way the checkout page sends them, with the price summary's total as the expected total.
   - Each must be charged that total, and keep figures that add up with the summary's discount and delivery.

## Not changed, on purpose

- **Orders already placed are not changed.** The store is not open yet, so none have a free-delivery code.
- **The discount on invoices still includes coins and a gift card,** as before.

## Verification

- `npm run typecheck`, `npm test` (1342 pass) and `npm run backend:audit` pass. `npm run build:cloudflare` with the CI environment passes.
- **Real orders on the production build,** with the local PostgreSQL database:
  - **Before the fix:**
    - the 10% order kept 9,900 - 990 + 500 = 9,410, its total;
    - the free-delivery order kept 9,900 - 500 + 0 = 9,400 against a total of 9,900, with a discount the summary never showed.
  - **After:** both keep the summary's figures, and both add up (9,410 and 9,900).
- The CI browser test runs the same two orders on this pull request.
- **The local store was left as it was** (restored from the dump).
