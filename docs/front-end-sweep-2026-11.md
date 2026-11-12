# Front-end sweep, sprint 3 (November 2026)

Branch `claude/ux-sprint3`, based on `origin/main` at d1c2a7c (after #603).

## What was checked

- **Routes:** 36 storefront paths at 1280×900 and 390×844, 72 page loads in all. For each: the HTTP status, uncaught page errors, console errors, server responses of 5xx, and error text on the page. Paths included malformed and encoded segments, unknown slugs and collections, the cart and checkout with and without items, the account pages, the legal pages and the feeds.
- **Interaction flows:** 13 flows on the storefront: add to cart and quantity 0, 9999 and text; wishlist; the photo zoom; cart select-all and remove; checkout validation, an invalid discount code, an invalid gift card and an empty submit (no order was placed); shop sort, a price range with minimum above maximum, and empty and encoded searches; the header search; the phone menu and search overlay; a newsletter with an invalid address; the cookie banner; and sign-in and register with invalid input.
- **Arabic:** not tested. Arabic is turned off for this store, so customers don't see it.

## Findings and fixes

1. **Crash (fixed).** A malformed percent-encoded path, such as `/product/%E0%A4%A`, returned a bare 500 on every dynamic route: product, collection, review, track, pay-invoice and blog. Next fails on the route's parameter before the page runs, so the page's own error handling never sees it. `proxy.ts` now checks the path first and shows the normal not-found page with a 404.
2. **Layout regression from sprint 2 (fixed).** On computers the delivery chip became a fourth item in the header row, but that row had three columns. So Account and Cart wrapped onto a second row on every page that shows the chip. The row now has a fourth column on computers. The sprint 2 checks measured only the phone header, which is why this was missed.
3. **Polish (fixed).** The chip's delivery line was cut off with an ellipsis ("Cash …"). It now wraps onto a second line.
4. **Interaction flows.** None of the 13 flows produced a page error or a console error.

## Left for the next pass

- A Best Sellers section on the home page shows three products. I did not change it. It may need the same four-product minimum as the other product rows.
- Arabic is not tested, because this store has it turned off.
- The two native cart checkboxes (17 px) remain. A custom checkbox is backlog work.

## Verification

- `tests/ux-sprint3.test.ts` covers the path guard and the header column (2 tests).
- Full suite, `tsc`, the backend audit and the production build.
- Crash sweep on the rebuilt app: 72 page loads, no 5xx and no uncaught errors. The remaining 404s are the intended not-found pages and a bogus order number.
- Header measured on every audited page: a single row, except checkout, which has no search bar.
