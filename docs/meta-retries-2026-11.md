# Retries for sales reported to Meta (November 2026)

Branch `claude/meta-retries`, based on `origin/main` at 7810ec8 (after #639). The audit's retries item asked for this; #637 covered emails and webhooks.

## What was wrong

- **Each sale goes to Meta from the server** (the Conversions API, `lib/meta-capi.ts`). This happens when a cash or transfer order is placed, or when a card payment goes through.
- **It was sent once.** If Meta didn't answer, was busy or had a server error, the sale was only logged. That sale was missing from the ad results whenever the shopper's browser had also blocked the pixel. Meta also optimises ads on fewer sales.
- **An expired access key** lost every sale until a new key was saved.

## What changed

1. **A failed sale report is kept for the hourly retries** (the retry list from #637, `lib/outbox.ts`, new kind `meta`).
   - **What is kept:** the event exactly as built at the sale, with the same event id (`purchase-<order number>`) and the same time.
   - **Which failures are kept:**
     - no answer or a timeout;
     - too many requests (429; codes 4, 17, 32, 341, 613);
     - Meta's own error (5xx; codes 1 and 2; or any answer Meta marks `is_transient`);
     - an expired or wrong access key (190).
   - **Tries:** 1, 2, 4, 8 and 8 hours later, like emails. All within a day, so well inside Meta's 7 days for late events.
   - **Never counted twice:** Meta keeps one event per event id, so a try that went through after all is not counted again.
2. **Each try reads the Pixel ID and the access key from Settings.** The key is never kept with the sale.
   - A sale made while the key was broken still reaches Meta once a new key is saved that day.
   - If the Conversions API has been turned off since (key or Pixel ID removed), the kept sale is given up. The activity log says so (`outbox.gave_up`).
   - The test event code of the first try is kept, so a test sale stays a test.
3. **A refusal that would happen again is only logged,** as before: a malformed event (100), a wrong Pixel ID, or a permission the key lacks.
4. **`sendMetaEvents` now keeps Meta's answer** (`MetaApiError`: the status, the code and `is_transient`), so the decision above can be made.

## Not changed, on purpose

- **Add to cart and checkout start are not kept.** The browser pixel sends them too, with the same event id, and there are many of them. A missed one matters far less than a missed sale.
- **Staff phone alerts are not retried.** They expire after 5 minutes on purpose (`TTL: 300` in `lib/push.ts`): a "new order" alert an hour late is noise. The same events also go by email, which is retried.
- **The cookie choice still decides.** A sale is sent and kept only when the shopper accepted cookies at checkout (#633).

## Verification

- `npm run typecheck`, `npm test` (1365 pass), `npm run backend:audit` and the dependency audit pass. `tests/meta-retries.test.ts` adds 7 tests:
  - which failures are kept;
  - that Meta's status, code and `is_transient` are kept;
  - the hourly try with the key saved in Settings and the first try's test code;
  - waiting or giving up;
  - that the sale is kept as built, without the key.
- `npm run build:cloudflare` with the CI environment passes.
- **20 checks pass on the production build,** with the local Postgres database and a stand-in for Meta's Conversions API. Real checkout orders were placed:
  - **Meta busy (503):**
    - the sale was reported at once and kept, with the same event id and time and without the key;
    - the hourly job sent it, Meta got the same event id and time, and the kept sale was marked sent and emptied.
  - **A refusal (400, code 100)** was not kept.
  - **Cookies declined:** nothing was reported or kept.
  - **An expired key (190):** the sale was kept, and after a new key was saved the hourly job sent it with the new key.
  - **Turned off:** with the key removed, the kept sale was given up without calling Meta, and the activity log recorded it.
  - **No key anywhere** in the retry list.
  - **Checkout start:** with cookies accepted, the checkout-start report reached Meta through the server while Meta was busy, and was not kept.
- **The local store was left as it was** (restored from the dump).
