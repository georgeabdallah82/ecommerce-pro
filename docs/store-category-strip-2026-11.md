# Store › "Shop by category" shows every active collection (November 2026)

Branch `claude/store-category-strip`, based on `origin/main` at 49588bc (after #626).

## What was wrong

**The owner reported:** after adding more than 4 or 5 collections, the new ones didn't show up for customers.

**The live store, read from its public sitemap and store APIs:**
- It has 5 active collections.
- Toiletries and Laundry have no active products. Personal Care has 2, Home Goods 3 and Kitchenware 2.

**Two things kept collections out of sight.**
1. **The menus left out collections with no products.** These are the computer's "All categories" panel (headed "Shop by category") and the phone menu.
   - So Toiletries and Laundry were never listed there.
   - Measured on main with 10 active collections, Laundry empty: both menus listed 9.
2. **On a phone, the home page's "Shop by category" strip was one row that scrolled sideways, with its scrollbar hidden.**
   - It showed three tiles and part of a fourth; the rest were out of sight, with nothing saying the row scrolls.
   - The first tile also sat against the screen's edge, out of line with the heading.

**One more limit:**
- The home page loaded only the first 12 active collections, while the theme editor previews and offers 24.
- So a strip set to show more than 12, or a collection picked beyond the first 12, was missing from the live page but shown in the editor.

## What changed

**The owner chose that every active collection shows, one with no products yet too.** A customer who opens an empty one sees "No products in this collection yet". Taking a collection off the store is still "Inactive" in its editor.

1. **`app/api/store/collections/route.ts`:** the menus list every active collection. One with no products shows "0 products".
2. **`app/storefront-sprint4.css`:** on phones, the strip shows every category in rows, aligned with the heading.
   - It is four across on most phones and three on the narrowest (320 px).
   - Computers are unchanged: up to four categories as wide cards, more in rows of tiles.
3. **`app/page.tsx`:** the home page loads the same 24 active collections as the theme editor (`lib/zone-data.ts`).

## Not changed, on purpose

- **The Collections page and the 404 page's categories** already listed every active collection.
- **Which collections the strip shows, and how many,** stay set in the theme editor (Category strip: "Collections shown" and "Choose collections").
- **The order** is the collections' own order, as before.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass.
  - `tests/store-category-strip.test.ts` adds 3 tests.
  - The category strip test in `tests/ux-sprint4.test.ts` now checks rows on phones.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **On the production build,** with 10 active collections on the local scratch database (Laundry with no products, the rest with products):
  - **Before (main):**
    - both menus listed 9, without Laundry;
    - on a phone, the strip showed 3 of its 10 tiles.
  - **After, the strip:**
    - All 10 are in view without scrolling at 1440, 1280, 900, 390 and 320 px.
    - That is 9, 8, 6, 4 and 3 across, with the first tile lined up with the heading.
    - The smallest tile is 82 px. axe finds nothing in the strip, no page scrolls sideways, and there are no page errors.
  - **After, the menus:** the computer's "All categories" panel and the phone menu list all 10, Laundry with "0 products".
  - **Laundry, empty:** both its links, `/shop?collection=laundry` from the strip and `/collections/laundry` from the menus, open with its name, "0 products" and an empty-state message. axe finds nothing on either.
- **The local store was left as it was.** The test collections were removed by restoring the dump.
