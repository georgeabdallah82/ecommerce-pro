# Storefront UX, sprint 2 (November 2026)

Branch `claude/ux-uplift-sprint2`, based on `origin/main` at 10b50c7 (after #602). The owner approved decisions 1 to 5 and 7 from `docs/ux-audit-2026-11.md`. Decision 6, the brand name, stays with the owner.

## What changed

1. **Checkout order.** On desktop the form comes first in the page, and the order summary follows it in the right-hand column. Keyboard order now matches what you see: contact, delivery, payment, discount code, Place order. The summary has no tab stops on desktop. On phones a total row sits above the form, and the full summary follows the form.
2. **Header.** On desktop the header has three rows: announcement, header (logo, search, delivery area, account, cart) and the category nav. The separate delivery bar is gone; its content is a chip in the header row. On phones the delivery area is a chip at the start of the search bar.
3. **Shop search.** The search box and its button are removed from the shop toolbar. The header search is the only search on every page. The sort control keeps the current search, and the "Search: …" chip and results heading still show what was searched.
4. **Category tiles.** A category without a photo shows a neutral tile with an icon, not its first letter. A product photo still comes before the icon.
5. **Today's deals.** A tab appears only when it can fill a row (at least four products, the section's existing `minProducts` setting). The default row holds five products, which fits one line on a computer. On this store fewer than four products are on sale, so the home page shows "New arrivals" with five products instead of "Today's deals" with a single card.
7. **Touch targets.** The 44 px targets now also apply to touch devices (`pointer: coarse`), such as tablets and touch laptops. Mouse users keep the 40 px controls.

## Where I departed from the approved wording

- **Phone checkout summary.** The approved plan put a collapsible summary at the top of the page on phones. That puts the summary before the form on phones only, which would bring back the reading-order mismatch on phones. So on phones the total sits at the top as a plain row, and the full summary follows the form.
- **Discount code.** The code field moved from the summary into the payment step, next to the gift card and above Place order. With the summary below Place order on phones, a code field there would be missed.
- **Phone delivery chip.** The approved plan put it under the logo. That made the header taller, because the chip's 44 px select enlarges the logo row. The chip sits at the start of the search bar instead, and the separate delivery row is gone.

## Results

Local production build with seeded data. Measured with the same audit as sprint 1 (six pages, 1280×900 and 390×844, signed in), plus targeted checks.

| | Sprint 1 | Sprint 2 |
|---|---|---|
| axe findings (12 page views) | none | none |
| Phone targets under 44 px | 0, except two cart checkboxes | same |
| Desktop targets under 44 px (pointer policy) | 7–18 per page | 7–18 per page |
| Text under 12 px | 0 | 0 |
| Horizontal overflow, broken images | none | none |

Checkout (not in the audit): no axe findings at either width. Tab order on desktop: contact fields (stop 6), discount code (stop 17), Place order (stop 20), no summary stops. On phone the total is above the first field (219 px and 379 px from the top), and the summary is below Place order.

Checks: `tsc` passed. `tests/ux-sprint1.test.ts` and `tests/ux-sprint2.test.ts` passed (18 of 18). The full suite passed (1109 of 1109). `npm run backend:audit` and `npm run build` passed.

## Notes for review

- The "Best Sellers" section on the home page shows three products. It's a different section type from the deals row, so I left it alone.
- The delivery chip's ETA line shows "Delivery: Tomorrow · Cash on delivery" and is cut off at 190 px on a computer. The full text is in the checkout.

## Still open

- **Decision 6, brand name (owner).** Set the store name in Settings. If your build uses `NEXT_PUBLIC_BRAND_NAME`, set it in the build environment too. That value is fixed at build time, so redeploy after changing it.
- **Cart checkboxes.** Two native 17 px checkboxes remain on the cart page. A custom checkbox is backlog work.
- **Desktop targets.** Desktop controls at 40 px are unchanged by design; decision 7 applies only to touch devices.
