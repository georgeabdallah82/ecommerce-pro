# Meta pixel and Conversions API: consent and matching event ids (November 2026)

Branch `claude/meta-consent-events`, based on `origin/main` at 1136957 (after #632).

## What was wrong

These were found by reading the code.

- **The pixel and the browser events were fine.**
  - The Meta pixel loads only after a shopper clicks Accept on the cookie banner.
  - Add to cart and checkout started go from the browser and from the server with the same event id, so Meta counts each once. Purchase does the same.
- **The server sent Purchase for every order, even after the shopper clicked Decline.** The choice lives only in the browser, so the server never knew it.
- **Page views and product views went from the browser only.** A browser that blocks the pixel sent neither.
  - Page changes inside the store were counted by Meta's own history tracking, with no event id.
  - So a server copy could not have been matched to them.

## What changed

1. **Purchase follows the cookie choice.**
   - The checkout sends the shopper's answer (`adConsentChoice()`, `components/cookie-consent.tsx`).
   - The order keeps it in a new `adConsent` column (`prisma/migrations/20261119000000_order_ad_consent`). The deploy applies the migration.
   - `sendMetaPurchase` sends only when it is "granted". That covers cash on delivery and card payments confirmed later.
   - Decline, or no answer, means no Purchase from the server, as from the browser.
2. **Product views:** each has an event id and a server copy with the same id. They use the same route as add to cart (`/api/analytics/meta`, `lib/meta-capi.ts`).
3. **Page views:**
   - Meta's own counting of address changes is off (`fbq.disablePushState`).
   - The first page view comes from the pixel snippet. Each change of page comes from the route tracker (`trackPageView()`).
   - Each carries an id, and its server copy shares it. A page view sends no product data.
   - There is still one page view per page.

## Not changed, on purpose

- Google Analytics and TikTok.
- What is sent to Meta for each event, apart from the new ids.
- Server copies need the Conversions API token in Settings › Tracking, as before.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/meta-consent-events.test.ts` adds 5 tests.
- `npm run build:cloudflare` with the CI environment passes.
- **8 browser checks pass on the production build.** The local store had a test Pixel ID and the migration applied; Meta's script was blocked, so the pixel's queued calls could be read.
  - **After Decline:** no pixel, nothing sent to the server, and an order keeps "denied".
  - **After Accept:**
    - Meta's address counting is off;
    - the first page view has an id its server copy shares;
    - moving to a product adds exactly one page view with its own shared id;
    - the product view has a shared id and names the product;
    - an order keeps "granted".
  - No page errors.
- **The local store was left as it was** (orders removed by restoring the dump).
