# Backend bug fixes (November 2026)

Branch `claude/backend-bug-fixes`, based on `origin/main` at 74359c6 (after #633). The four bugs from the backend audit.

## What was wrong

1. **Card checkouts left at the payment page kept their stock.**
   - `app/api/internal/release-expired-reservations` cancels a card checkout still unpaid after 30 minutes. It puts the stock back and returns the coupon use, coins and gift-card balance the checkout took.
   - Nothing ran it. It answered only a GET with the `CRON_SECRET` bearer, for the old host's scheduler, and the Worker's cron (`worker.ts`) never called it.
   - A failed payment did release stock (`lib/payment-outcome.ts`). A shopper who simply left the payment page did not, until staff cancelled the order.
2. **Each password check took about 380 ms of CPU.**
   - `lib/auth.ts` used bcryptjs (pure JavaScript) at cost 12, measured at 379 ms. The Workers Free plan allows 10 ms per request.
   - Customer sign-in and sign-up, password changes, admin sign-in and admin re-confirmation all paid it.
   - So did staff creating a customer, on a random password nobody uses.
3. **The invite lookup's limit was kept in memory.** On Cloudflare each copy of the app counted on its own, so guessing invite codes got more tries than the 30 per 10 minutes meant.
4. **Webhook signatures had no timestamp.** `X-Webhook-Signature` covers only the body, so a captured delivery could be replayed later.

## What changed

1. **The stock release runs every hour.**
   - The Worker's 15-minute cron calls it at the top of the hour, beside the refund check, so the database is woken no more often than before.
   - It answers the Worker's own POST (`lib/internal-job.ts`), or the `CRON_SECRET` bearer for a run by hand. A GET is refused.
   - **Before cancelling, it asks the payment gateway.**
     - A payment the gateway took, whose notification never arrived, is marked paid instead.
     - No answer, or no gateway set up, lets the release go ahead. Money that still arrives later is flagged on the cancelled order, as before.
2. **Passwords use scrypt,** run as native code by Node and by Cloudflare's runtime (`lib/auth.ts`).
   - N=16384, r=8, p=1: each try needs 16 MiB of memory, which slows down cracking hardware.
   - About 40 ms per check in Cloudflare's runtime.
   - **Older bcryptjs hashes still sign in.** Customer sign-in, admin sign-in and admin re-confirmation replace them with scrypt (`upgradePasswordHash`).
   - Customers made by staff use the same hashing.
3. **Invite lookups are counted in the database** (`app/api/invite/route.ts`), like the other sensitive routes.
4. **Webhooks also send `X-Webhook-Timestamp` and `X-Webhook-Signature-V2`** (`lib/webhooks.ts`).
   - V2 is the HMAC-SHA256 of the timestamp, a dot and the body.
   - `X-Webhook-Signature` is unchanged, so existing receivers keep working.
   - The secret's help text in Operations says how to check both.

## Not changed, on purpose

- **The Free plan's limit.**
  - About 40 ms is still over its 10 ms per request, and every secure password hash costs more than that.
  - The Workers Paid plan is the fix for the limit. This change makes each check about 9 times cheaper on either plan.
- **The production admin script** (`scripts/ensure-admin.ts`) still writes a bcryptjs hash. It is replaced at that admin's first sign-in.
- **The other in-memory limits** (products, wishlist, cart, delivery rates, the image proxy, visit counts) guard cheap requests. Counting them in the database would add a write to each.
- **Reservations still expire after 30 minutes,** as the job already said.

## Verification

- `npm run typecheck`, `npm test` (1308 pass) and `npm run backend:audit` pass.
  - `tests/backend-bug-fixes.test.ts` adds 7 tests.
  - `tests/reservation-expiry.test.ts`, `tests/payments-followups.test.ts` and `tests/webhooks.test.ts` follow the changes: the POST, the `paid` count and the V2 signature.
- `npm run build:cloudflare` with the CI environment passes.
- **Cloudflare's runtime:** scrypt ran in the workerd binary the build uses. It matched Node's output for the same input and took about 37 to 46 ms per check. bcryptjs at cost 12 takes 379 ms of CPU in Node.
- **16 checks pass on the production build,** with the local database:
  - **A customer:** an account with a bcryptjs hash signs in, and the hash becomes scrypt. It signs in again, and a wrong password is refused.
  - **The admin:** the real sign-in with its 2-step code works with the old hash, replaces it, and works again with the new one.
  - **The stock release:**
    - A GET is refused (405), and a POST without the key or bearer is refused (401).
    - A card checkout made two hours old, with a pending gateway payment, is cancelled.
    - Its reserved stock goes back (5 to 4), and its timeline says why.
    - The gateway isn't set up locally, so it could not answer "paid".
  - **An invite lookup** answers and is counted in the database.
- **The local store was left as it was** (restored from the dump).
