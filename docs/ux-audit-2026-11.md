# Storefront UX audit and uplift, sprint 1 (November 2026)

Branch `claude/ux-uplift-sprint1`, based on `origin/main` 3813930. Scope: the customer-facing storefront. The admin is the next audit.

## Summary

- **axe:** no findings on the six audited pages at desktop and phone widths. Before, the pages had landmark (`region`), heading-order and label-name findings.
- **Phone touch targets:** no element under 44 px on home, shop, product, login or search. The cart with one item keeps two native 17 px checkboxes (see "Left as is").
- **Text:** nothing under 12 px on the audited pages (7 instances before).
- **Layout:** no horizontal overflow, no broken images, and no console errors on the audited pages.

## How it was measured

- Playwright with the pre-installed Chromium, axe-core 4, and six pages (home, shop, product, cart, login and a search URL) at 1280×900 and 390×844.
- The audit runs as a signed-in shopper, because it reuses a login session. Signed-in and signed-out pages differ in the header, so both matter.
- The production build ran locally against seeded data, not against production.
- Each page is checked for axe violations, elements under 44×44 px, text under 12 px, horizontal overflow, broken images and console errors. The scripts live in the session scratchpad, not in the repository.
- The `/search` URL returns 404 in the audit. That is an audit-URL artifact: the storefront search is `/shop?q=`.
- Both the phone shop and phone product pages were also reviewed by screenshot.

## Before and after

| Page | Viewport | axe before | axe after | Small targets before → after | Text under 12 px before → after |
|---|---|---|---|---|---|
| home | desktop | label-name 2, region 3 | none | 21 → 15 | 1 → 0 |
| shop | desktop | heading-order 1, label-name 2, region 4 | none | 16 → 13 | 0 |
| product | desktop | label-name 2, region 3 | none | 22 → 18 | 0 |
| cart | desktop | label-name 2 | none | 18 → 15 | 2 → 0 |
| login | desktop | label-name 2, region 3 | none | 11 → 8 | 0 |
| search | desktop | label-name 2, region 3 | none | 10 → 7 | 0 |
| home | phone | region 2 | none | 18 → 0 | 1 → 0 |
| shop | phone | heading-order 1, region 3 | none | 15 → 0 | 0 |
| product | phone | region 2 | none | 22 → 0 | 0 |
| cart | phone | none | none | 17 → 2 (one item in the cart) | 3 → 0 |
| login | phone | region 2 | none | 10 → 0 | 0 |
| search | phone | region 2 | none | 9 → 0 | 0 |

The desktop small-target counts are controls at 40 px. They are pointer targets, and they are not part of this sprint (see "Left as is").

The cart page sometimes loads before the injected cart is read, so the audit can show an empty cart. The cart row above comes from a targeted check with one item in the cart.

## What changed

1. **Landmarks and headings (shop).** The shop's content sat outside `<main>`. The page is now one `<main>` with its heading first, and the results column is a `div` (`components/aliexpress-shop.tsx`). The "Collections" heading stays in the outline and is visually hidden on phones, where the collections are a row of chips, instead of `display: none`, which removed it and skipped a heading level (`app/storefront-market.css`).
2. **Accessible names match what is visible.** A name must contain the visible text. Three controls broke that rule:
   - The cart badge: "Cart" + "0" in the text made "Cart0", which is not in "Cart with 0 items". The count is now drawn by CSS from `data-count`.
   - The signed-in avatar initial was in the account link's text. It is now drawn by CSS from `data-initial`.
   - The signed-in account link's label read "My account (name)" while the visible text was "Hi, first name". The label now starts with the visible text: "Hi, name (My account)".
   A whitespace change did not fix the cart badge, which is why the count moved into CSS. The same change is in the mobile-menu cart (`components/store-nav-fixed.tsx`).
3. **Phone touch targets.** Most misses were CSS precedence, not missing rules. Later 40 px rules overrode the 44 px rules at the same specificity, and the header search bar was 50 px with 5 px padding, so its input was 40 px tall. Fixes (`app/storefront-market.css`, phone block):
   - The header search bar is 54 px, so its input and button are 44 px.
   - The announcement bar and its dismiss button are 44 px.
   - The delivery select, category tabs, wishlist buttons, footer form, login link, product zoom, review stars and returns link are 44 px.
   - The slide dots keep their look. Each dot now sits in a 44 px button.
   - Inline text links use the project's padding-with-negative-margin pattern, so the text does not move.
4. **Readability.** The 11–11.5 px captions are 12 px: the cart SKU, the cart note, the sticky cart info, and the small "Featured" text (`app/storefront-legacy.css`, `app/storefront-market.css`).
5. **Cookie card.** The banner is a compact card at the bottom-left on desktop and a bottom card on phones. "Privacy policy" and "Cookie settings" have 44 px targets without changing the text position (`components/cookie-consent.module.css`).
6. **Visuals.** The product placeholder is a soft illustration without developer text (`public/placeholder-product.svg`). The delivery bar is a labelled region (`components/market-chrome.tsx`).

## Retracted finding

In the first pass, a full-page home screenshot showed white product boxes. That was a capture artifact: the placeholder had loaded (150 px natural width, opacity 1). It is not a product bug.

## Left as is, and why

- **Desktop controls at 40 px.** These are pointer targets. The WCAG 2.2 AA minimum is 24 px. Whether desktop should also meet 44 px is an owner decision.
- **Cart checkboxes.** The row checkboxes are 17 px native controls inside 44 px label areas. The "Select all items" checkbox has no label wrapper. A custom checkbox component is backlog work.
- **Newsletter honeypot.** The `company` field is `aria-hidden`, has `tabIndex -1` and `opacity: 0`, so it is excluded from the audit metric.

## Decisions for the owner (not changed)

1. **Desktop order summary:** the DOM order and the visual order differ. The discount-code control is the third stop.
2. **Header density:** four stacked rows on desktop and phone (announcement, search, delivery bar, navigation).
3. **Duplicate search:** the header and the shop page both have search.
4. **Category tiles:** the home tiles show only letters, with no photos.
5. **"Today's deals":** the layout is a single card.
6. **Brand name:** the placeholder brand "YOUR BRAND" comes from store configuration.
7. **Product photos:** the seeded store has none. This is content, not code.
8. **Desktop target size:** whether desktop controls should meet 44 px (see "Left as is").

## Backlog for later sprints

- **Sprint 2:** header density and search consolidation (after decisions 2 and 3), category tiles, the deals layout.
- **Sprint 3:** the product card and imagery system, trust and checkout visuals.
- **Sprint 4:** the admin UI, with the same method, signed in as an admin.
- **Cart:** a custom checkbox to replace the two native 17 px controls.

## Verification

- `npx tsc --noEmit`: passed.
- `node --import tsx --test tests/ux-sprint1.test.ts`: 12 of 12 passed.
- `npm run backend:audit`: passed (116 admin API files and 177 API files scanned).
- `npm run build`: passed.
- `npm test`: 1,103 of 1,103 passed.
