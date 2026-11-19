# Meta: Purchase follows the cookie choice (November 2026)

Branch `claude/meta-consent-events`, based on `origin/main` at 1136957 (after #632).

## What was wrong

- **The browser side was fine.** The Meta pixel loads only after a shopper clicks Accept on the cookie banner, so nothing goes from the browser after Decline.
- **The store's server sent Purchase for every order, even after Decline.** The choice lived only in the browser, so the server never knew it.

## What changed

1. The checkout sends the shopper's answer (`adConsentChoice()`, `components/cookie-consent.tsx`).
2. The order keeps it in a new `adConsent` column (`prisma/migrations/20261119000000_order_ad_consent`). The deploy applies the migration.
3. `sendMetaPurchase` (`lib/meta-capi.ts`) sends only when it is "granted".
   - That covers cash on delivery and card payments confirmed later.
   - Decline, or no answer, means no Purchase from the server, as from the browser.
   - Orders placed before this change have no answer kept. A card payment confirmed later for one of them sends no Purchase.

## What Meta shows

Read on 19 November with the Meta Ads connector, without changing anything.

- **The pixel "Yallahaul" is active.** Over 4 weeks it got 155 events from browsers and 191 from servers.
- **Meta's Conversions API Gateway is on for this pixel.**
  - The pixel's settings send each event to a gateway server, which passes a copy to Meta.
  - That is why browser and server counts match one for one, page views and product views included.
- **The old Shopify store, yallahaul.myshopify.com, still sends into the same pixel:** 30 events in 4 weeks.
- **Match quality:** page views score 6.1 out of 10, with the IP address, browser details and Meta's cookie on every one. The other events are too few to score.

## Not changed, on purpose

- **Page views and product views get no server copies from the store.**
  - A first version of this branch added them.
  - Meta's gateway already copies them whenever the pixel loads.
  - The store's copies would only add visits where the browser blocks Meta's script. Those carry no Meta cookie, so Meta matches them poorly, and each page view would cost one more Worker request.
- **Add to cart and checkout started** keep their server copies, as before.
- **Google Analytics and TikTok.**
- **The server's Purchase** needs the Conversions API token in Settings › Tracking, as before.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/meta-consent-events.test.ts` adds 3 tests.
- `npm run build:cloudflare` with the CI environment passes.
- **Browser checks on a production build,** with a test Pixel ID and the migration applied on the local store:
  - after Decline: no pixel, nothing sent to the server, and an order keeps "denied";
  - after Accept: an order keeps "granted";
  - no page errors.
  - They ran on the first version of the branch. The Purchase code is unchanged since, and the page-view files are back to main's.
- **The local store was left as it was** (restored from the dump).
