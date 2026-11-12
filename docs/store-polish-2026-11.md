# Store polish: collections, account, product photos, search (November 2026)

Branch `claude/store-polish`, based on `origin/main` at d7b1afb (after #608). A survey of the pages the earlier rounds had not covered: collection pages, the menus, the signed-out account page, search, the empty states, the order confirmation and sale prices. The order confirmation, the empty cart, search results and sale prices on the product page already looked finished, and are unchanged. New styles are in `app/storefront-polish.css`, imported last.

## What changed

1. **Collections without a photo (the grey box).** A collection with no photo of its own showed the stock placeholder, a grey 3D box, in four places: the collections page, its own banner, the phone menu's category tiles and the desktop "All categories" panel. A seeded collection can even store the placeholder file as its image ("Best Sellers" here), which got around the existing fallback to a product photo.
   - Each place now uses the collection's own photo, else its first real product photo, else its department's glyph on the brand cream. That is the same set of line icons as the homepage's category strip: a house for home essentials, a washing machine for laundry.
   - The collection page shows its photo banner only when it has a photo; otherwise the title stands on its own (the page's existing header).
   - `lib/collection-photo.ts` decides what counts as a real photo. Empty values and the placeholder do not; every value a store already uses (a site path, an http(s) or `data:` URL) is kept as it is.
   - The glyph map moved to `components/department-glyph.tsx`, so the menus can share it without loading the homepage sections.
2. **Account, signed out.** "Account" in the header led signed-out shoppers to a small card with two buttons. It now goes straight to the sign-in page, which has the store's photo, the account's benefits and "Create an account", and brings the shopper back to their account.
3. **Product photos on phones.** Photos already swiped, but nothing said there was more than one. A "1 / 2" count now sits on the photo, opposite the zoom button.
4. **Turning a product photo** (a thumbnail, a swipe or an option) fades the new photo in instead of snapping. It never happens on the first photo, which is the page's largest paint, and never for visitors who ask for less motion.
5. **The search box on phones.** The store's square focus outline sat inside the rounded search card. The field is now a rounded field of its own, so the outline follows its corners. It can also shrink, so the close button stays inside the card.
6. **Sale prices on product cards (accessibility).** The old price of a product on sale, struck through, was `#9ca3af` on the page: 2.3:1, below the 4.5:1 that small text needs. It now uses the theme's muted ink (5.8:1), which still sits back behind the price. This surfaced once a local product was put on sale for the review.

## Not changed, on purpose

- **The footer's brand column** shows the store's tagline and social links once they are set (Theme settings → Footer); it does not invent copy.
- **The order confirmation** ("Thank you", the order number, what happens next, the summary and the delivery address) and **the empty cart** already read as finished.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1145 tests; `tests/store-polish.test.ts` adds 7, including the rules for what counts as a real photo.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- In the browser at 1280 and 390 px:
  - No page shows the placeholder box. With a collection that has no real photo at all, the collections page, the desktop panel and the phone menu show its glyph.
  - The collection page shows its banner only with a photo.
  - Signed out, `/account` goes to sign-in (307); signed in, it shows the account.
  - The photo count reads "2 / 2" after a swipe. Turning a photo fades it in, but the first photo and reduced motion never animate.
  - The search overlay's buttons stay inside the card.
- UX audit, 6 pages at desktop and phone widths: axe reports no violations (after the sale-price fix), and no phone tap target is under 44 px.
- Crash sweep: 72 page loads with the same statuses as the last round, no 5xx and no page errors.
- The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) from the earlier rounds still pass.
- The local test data used for this review (a sale price, a collection without photos) was removed afterwards.
