# Product cards: the name is the link, the buttons sit beside it (November 2026)

Branch `claude/store-cards`, based on `origin/main` at 7012385 (after #616).

Every product grid in the store uses one card, `ProductCard` in `components/storefront-sections.tsx`:
- the home page rows
- the shop and search results
- collections
- a product page's "You might also like"
- the cart's suggestions
- the wishlist
- "Recently viewed"

The card was one link holding two buttons: the heart and "Add to cart". HTML does not allow a button inside a link, and screen readers and keyboards handle it unevenly. In practice:
- **The link's name ran the whole card together.** A screen reader read the photo's text, "Add to wishlist", the name, the price, the delivery note and "Add to cart" as one link, e.g. "Signature Value Box$99.00 Cash on deliveryAdd to cart".
- **Every grid had buttons inside links.** There were 4 to 16 per page, two per card.

The pop-ups round left this for its own round (`docs/store-interactive-2026-11.md`).

For this round the local store was given cards in every state. The test data was removed afterwards:
- a discounted product
- a product with two sizes
- a sold-out product
- two reviews
- two products in the test customer's wishlist

New styles are in `app/storefront-cards.css`, imported last.

## What changed

1. **The name is the link; the card is not.**
   - The product's name (its heading) holds the link.
   - The link's cover stretches over the whole card. A click or tap anywhere on the card still opens the product: the photo, the name, the price, the space around them.
   - The heart and "Add to cart" are outside the link now, as buttons of their own, above the cover.
   - A screen reader hears the link as the product's name. The rating, price and delivery note follow as text.
   - Both buttons are described by the product's name (`aria-describedby`), so "Add to cart" also says which product.
   - Tab goes down the card as it looks: the heart, the name, then "Add to cart". Before, it went to the card first, then the heart, then "Add to cart".
2. **The photo is read only when it says something new.**
   - A photo without a description of its own had the product's name as its text. That was hidden inside the link's name before. Outside the link, the name would be read twice.
   - So the photo is now decorative unless it has its own description, like the category circles.
3. **The same look and behaviour.**
   - The positions and sizes of the card, photo, name, price, heart and button are the same on every grid.
   - The keyboard ring stays around the whole card: 3 px red, 2 px out. It is drawn on the card while its name has focus. A browser without `:has()` draws it on the link's cover, which is the card's size.
   - Hover is unchanged:
     - the photo lifts
     - the second photo fades in
     - the pointer is a hand everywhere on the card
     - the heart can still be clicked while the photo is lifted
   - In the theme editor, a click on a card still selects its section: the click handler stays on the link.

How the layers work (`app/storefront-cards.css`):
- **The card is its own layer** (`position: relative; isolation: isolate`). The ranking badge on Best Sellers, the header, the sticky "Buy" bar on phones and the other fixed bars stay above it, as before.
- **The photo sits above the link's cover.** A photo that lifts on hover becomes a layer of its own, and the heart inside it would otherwise end up under the cover. The photo lets clicks through to the link (`pointer-events: none`), so it still opens the product, while the heart takes its own clicks.

## Not changed, on purpose

- **The older "classic" card** (`focalProductCard`, in the same component) also has buttons inside its link. No store shows it any more:
  - Every store is switched to the market design when its theme loads (`switchToMarket`, called from `lib/theme.ts`).
  - The theme editor has no way back.
  - It is left as it is rather than changed without a page to check it on.
- **Right-clicking a card's photo** now opens the link's menu (open in a new tab, copy the link) rather than the image's (save image). That is the price of the photo passing clicks to the link. Product pages still offer their photos as images.
- **The cards' content and wording** are as they were. No new texts, so nothing new to translate.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1200 tests; `tests/store-cards.test.ts` adds 6.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- Every grid was checked before and after: the home page, shop, a collection, a product page, the cart and the wishlist, each at 1280 px, 390 px and 390 px in Arabic.
  - **Buttons inside links:** 4 to 16 per page before, none now.
  - **Names:** each card's link is the product's name, and its two buttons are described by it.
  - **Layout:** the positions and sizes of the card, photo, name, price, heart and button are identical on all 18.
  - **Clicks** behave as before at all three sizes:
    - the photo, the name, the price and the space beside them open the product
    - "Add to cart" stays on the page
    - the heart is what sits under the pointer, also while the photo is lifted on hover
  - **Hover:** the second photo fades in, the photo lifts, the name stays unstyled (no underline), and the pointer is a hand.
  - **Keyboard:** the ring goes around the card, 3 px red and 2 px out, as before. A long name still stops at two lines with an ellipsis.
  - **Layers:** the header and the sticky "Buy" bar stay above the cards when the page scrolls cards under them.
  - **axe** finds nothing on any of these pages, before or after.
- Regression checks:
  - UX audit of 9 pages at both widths.
  - Crash sweep: 72 page loads, only the expected 404s.
  - Homepage motion: 37 checks. The photo hover is now reached by the mouse's position, since the photo passes the pointer to the link.
  - Sticky header, focus and scroll lock: 10 checks.
