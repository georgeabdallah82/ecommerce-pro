# Account polish: dashboard, order history, order statuses, wishlist (November 2026)

Branch `claude/store-finish`, based on `origin/main` at 61d9912 (after #609). The signed-in pages are the ones a returning customer sees most, and the earlier rounds had not reached them: the account dashboard, the order history, an order's page, the wallet and the wishlist. New styles are in `app/storefront-account.css`, imported last.

## What changed

1. **Dashboard tiles.** The five tiles (orders, saved addresses, wallet, coins, notifications) stacked one per row on phones and tablets, because `storefront-legacy.css` forces one column below 900 px.
   - Phones: two to a row, with the fifth across both. Below 360 px, where a balance would not fit beside its icon, one per row.
   - Tablets: three, then two. Computers: five in a row.
   - Every row is as tall as its tallest tile, so a label that wraps ("Saved addresses") does not leave the tiles uneven.
   - Each tile has an icon on the brand cream. Orders, Wallet and Coins are now links (to the order history and the wallet), as Notifications already was. Saved addresses is not: the addresses are further down the same page.
2. **Order history.** Each order is one row: up to three photos of what was bought, the number, the date, the item count ("2 items", in Arabic "قطعتان"), the status, the total and a chevron.
   - A product without a photo gets a plain parcel tile, never the stock placeholder.
   - The status was printed raw ("CONFIRMED"), in Arabic too. It is now in the shopper's language.
3. **A colour per order status**, on the dashboard, the order history and the order page. They were all the same pink.
   - Amber: pending (6.8:1).
   - Blue: confirmed and processing (5.8:1).
   - Violet: shipped (7.6:1).
   - Green: delivered (6.3:1).
   - Grey: cancelled and refunded (5.5:1).
   - The pill's outline takes the same colour; it was the brand red.
4. **The order page's totals add up.** It listed the subtotal, shipping and total, but not the discount or the tax. An order with a $160 discount read "$198.00, $0.00, total $38.00".
   - The discount (in green, as a saving) and the tax are now listed, as on the order confirmation.
   - In Arabic the discount stays one left-to-right amount ("−$160.00", not "$160.00−"), here and on the confirmation page.
5. **The wishlist.**
   - Empty, it was one line of text. It is now the same kind of card as the empty cart: a heart, "You haven't saved anything yet.", how to save something, and "Browse the shop".
   - The "SAVED" label above the title was grey on a peach pill at 11 px (4.0:1). It is now plain small text like the cart's (5.8:1).
6. **Accessibility and finish on the account pages.** The UX audit found these once it covered the signed-in pages:
   - The cards' titles were h3 straight after the page's h1, a skipped level for screen readers. Meanwhile "Change password" and "Delete my account" were h2 at a larger size. All are h2 now, at one size. This covers the dashboard, an order's page, the wallet, and the signed-out order and notification pages.
   - "Back to account" was a 20 px tall tap target on phones; it is 44 px.
   - The order timeline's times were 11.7 px; they are 12.5 px.
   - The "Your data" card had no padding (its text touched the card's edge) and stretched to the height of the card beside it.

## Not changed, on purpose

- **The dashboard's recent orders** keep their compact rows, without photos, in their half-width column. The full history, with photos, is one tap away.
- **Corner radius.** `storefront-legacy.css` gives every card 12 px with `!important`. The tiles and order rows keep it, so they match the other cards on the page.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1154 tests; `tests/account-polish.test.ts` adds 9, including the contrast of every status colour.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- Signed in, in the browser at 1280 and 390 px, and in Arabic:
  - The tiles at 12 widths from 320 to 1280 px are laid out as above, with no balance wrapping and no sideways scroll.
  - Order rows show 46 px photos, the item count, and the translated, coloured status.
  - An order with a discount lists "Discount −$160.00" in green, in Arabic too.
  - The empty wishlist shows its card.
- axe found no violations on the six account pages (dashboard, order history, an order, wishlist, wallet, notifications) at either width. Before these changes, three had a skipped heading level and the wishlist failed colour contrast.
- UX audit of 9 pages at desktop and phone widths (home, shop, a product, cart, sign-in, and the account dashboard, order history, an order and the wishlist):
  - No axe violations.
  - No phone tap target under 44 px.
  - No text under 12 px.
  - No sideways scroll.
- Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
- The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) from the earlier rounds still pass.
