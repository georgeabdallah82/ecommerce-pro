# Audit of the public surface, and bad input (November 2026)

Branch `claude/input-hardening`, based on `origin/main` at 27b1d11 (after #644). This continues the audits, on the part no earlier one went through route by route: what shoppers, robots and attackers can reach without staff access. That is 54 API routes: customer accounts, checkout, order lookups and links, uploads, reviews and the public forms.

## Read through: solid

- **Who may call what.**
  - Customer routes check the signed-in account.
  - Order pages and payment proofs need the order's code, its email or its owner.
  - Invoice payment, delivery tracking and the driver's page need a long or signed link. A driver can only change the orders given to them.
- **Sessions:**
  - each request rechecks the account: disabled, staff without 2-step login, or sessions revoked by a password, email or role change;
  - staff sessions end after a shift;
  - the caller's address comes from Cloudflare's own header, which a visitor cannot set.
- **Uploads.**
  - Review photos need the order's review link.
  - Payment proofs:
    - are charged to a per-address limit before the body is read;
    - are read only up to their size limit;
    - stay private.
  - Both check what the file really is.
  - Every uploaded file the store serves comes with a sandboxing Content-Security-Policy and `nosniff`. An SVG opened directly can't run script as the store.
- **Raw HTML.** Pages, blog posts and policies are cleaned with an allow-list when saved or shown. Product descriptions are either cleaned or shown as plain text. Store details in the default policies are escaped.
- **What is revealed:**
  - the public product list uses a fixed set of fields;
  - cost prices and stock per location need an API key with `products.read`;
  - the public settings answer is an allow-list.
- **Rate limits** are on every route that writes or looks something up, except the read-only catalog routes, which are cached.
- **Data that grows** is pruned daily: visitor stats, searches, the activity log, the retry list and rate-limit counters. The email log and saved checkouts aren't, but they grow slowly.

## Tried with bad input: two crashes, fixed

Every public route, and the customer routes signed in as a test customer, got a dozen kinds of bad input. This ran on the production build with a local PostgreSQL, 555 requests a run:
- broken JSON, `null`, arrays and plain values instead of objects;
- wrong types and huge strings;
- prototype keys and lists with junk;
- NUL characters and lone surrogates;
- numbers out of range;
- odd query strings and path segments (`%00`, `../`, very long values, cloud metadata addresses for the image proxy).

The fuzz flagged any 5xx answer, any answer slower than 8 seconds, and any answer showing internals.

**Results:**
- No slow answers and no leaked internals.
- Bad input got 400, missing access got 401 or 403, unknown items got 404, and floods got 429.
- Two kinds of crash (500):

1. **A NUL character in any text broke the request.** Postgres can't keep U+0000 in text, and refuses the whole query ("invalid byte sequence for encoding UTF8: 0x00").
   - **Where the fuzz hit it:** the newsletter, forgot-password, resend-verification, the product list's collection filter, and the delivery tracking link.
   - **What was at risk:** any route that saves or looks up typed text. People never type the character; it comes from broken or hostile requests. It also made the database-backed rate limit fall back to the per-copy one for that request.
   - **The fix:** `withoutNul` in `lib/prisma.ts` drops the character from every text value on its way to the database, in single queries and inside transactions, so no route can trip on it.
     - Binary values are passed through unchanged.
     - A query without the character is passed on as it is.
2. **A JSON body of `null` crashed four customer routes:** deleting the account, changing the password, asking for a return, and removing a phone from notifications.
   - **Why:** they read a field straight from the parsed body. `.catch(() => ({}))` only covers JSON that can't be read, and `null` is valid JSON.
   - **The fix:** each now reads `null` like an empty body.
   - **Everywhere else:** the fuzz shows every other public route already checks its input. The same pattern is in staff routes, where only the store's own screens send requests, so it was left there.

## Not changed, worth knowing

- **Customer emails are English only.** Orders don't record the shopper's language. Once Arabic is switched on for customers (theme settings, Languages), Arabic shoppers still get English confirmation, shipping and review emails. This needs the order to keep its language, plus Arabic versions of about ten emails. It's a feature to plan, not a bug.
- **The "added to cart" and "started checkout" reports to Meta** come from the shopper's browser, like the pixel itself. A robot can send fake ones within the rate limit, as it can to the pixel. Sales are reported to Meta only by the store's server.

## Verification

- **Checks:** `npm run typecheck`, `npm test` (1390 pass), `npm run backend:audit` and `npm run build:cloudflare` (CI environment) pass.
- **`tests/input-hardening.test.ts` adds 4 tests:**
  - the NUL character is dropped from text and lists of text, while numbers, dates and binary values pass through untouched;
  - a query without one is passed on as it is;
  - inside a transaction too, which otherwise behaves as itself (commit, rollback, options);
  - every query and transaction goes this way;
  - the four routes read `null` like an empty body.
- **The fuzz again on the rebuilt store:** 555 requests and **0 findings**.
  - The five NUL cases now answer 200, 400 or 404.
  - Account deletion and password change, sent `null`, answer 400 with their normal messages.
- **Real transactions:** the 14 shopper and staff journeys pass on this build. They place an order, move it to delivered and rate it, through the wrapped transactions.
- **New in the staging check:** `scripts/e2e/write-path.mjs` sends a NUL to the newsletter, the password reset and the tracking link on every pull request. It expects an answer below 500, on real PostgreSQL in the Cloudflare runtime.
- The local store was restored from the dump afterwards.
