# Discount codes: once per customer (November 2026)

Branch `claude/coupon-once-per-customer`, based on `origin/main` at 55ae854 (after #635). A first-month item from the backend audit.

## What was missing

- **A code couldn't be kept to one use per customer.** It could be capped in total (the usage limit) or kept to first orders.
- So a shared code such as WELCOME10 worked on every order the same person placed.

## What changed

1. **"Once per customer" in Admin › Discounts,** under "First order only", for codes only (`components/coupons-admin-pro.tsx`).
   - It is stored on the discount: `oncePerCustomer`, migration `20261119120000_coupon_once_per_customer`.
   - It is off for every existing discount. The deploy applies the migration.
   - An automatic discount never keeps it (`app/api/admin/coupons/route.ts`): nobody types it, so there is no one to refuse.
2. **Checkout and the price summary refuse a second use:** "You have already used this code" (`app/api/checkout/route.ts`, `app/api/checkout/quote/route.ts`).
   - **The customer is matched three ways** (`usedCodeBefore` in `lib/customer-history.ts`), so ordering without an account doesn't get around it:
     - by their account;
     - by their email, in any letter case;
     - by their phone number, written any way ("+961 70 111 222" is "70111222").
   - A cancelled order gives the use back, as it gives back the code's count.
   - The price summary shows the message as soon as the code is applied with the customer's details.

## Not changed, on purpose

- **Two orders placed at the same moment** by the same customer could both get the code. The check is not inside the order's transaction; the risk is small for a small code.
- **Automatic discounts** have no "once per customer". "First order only" covers the welcome case.
- **The discounts list** doesn't show the setting; the form does.

## Verification

- `npm run typecheck`, `npm test` (1318 pass) and `npm run backend:audit` pass.
  - `tests/coupon-once-per-customer.test.ts` adds 4 tests.
  - The in-memory test database doesn't apply these filters, so the behaviour is checked against Postgres below.
- `npm run build:cloudflare` with the CI environment passes.
- **14 checks pass on the production build,** with the local Postgres database:
  - **Admin:**
    - a code saved with "Once per customer" keeps it;
    - an automatic discount saved with it doesn't;
    - the form opens the code with the box ticked, and doesn't offer it on the automatic one;
    - no page errors.
  - **Checkout:**
    - customer A's first order with the code goes through, and the order keeps the code;
    - the same email again, with another phone, is refused, and the price summary says so before ordering;
    - the same phone number written another way, with another email, is refused;
    - a new customer gets the code, and the price summary accepts it;
    - after customer A's order is cancelled, they can use it again.
- **The local store was left as it was** (restored from the dump).
