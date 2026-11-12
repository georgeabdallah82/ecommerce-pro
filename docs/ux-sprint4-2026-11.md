# UX sprint 4 (November 2026)

Branch `claude/ux-sprint4`, based on `origin/main` at c29f919 (after #604). A first pass, then a design pass after review: the first versions worked but looked templated (rainbow tiles with one placeholder icon, a red gradient slab with a decorative circle, all-caps labels above headings).

## Design approach

Everything stays inside the market theme's own system: the store red for actions only, ink (#121212) for text and icons, the warm grey page, the cream band (`--br-cream`) and Bricolage for headings. No new colours, no decorative gradients, sentence case throughout.

## What changed

1. **Category strip.** White tiles on the cream band. A category with no photo shows a department glyph picked from its name: a flame for best sellers, a house for home, a spray can for cleaning (`lib/category-glyph.ts`, one set of line icons). A collection photo fills the tile; a product photo sits on white. On computers, up to four categories become wide department cards that share the row; more wrap into rows of tiles. Phones keep one row that swipes. The keyboard focus ring is visible, and hovering a card changes only that card.
2. **Cart rows.** 22 px checkboxes inside 44 px touch targets. Each row's checkbox sits in its own lane left of the photo, centred on it, directly under the select-all box.
3. **Sign-in.** One card. On computers the left half shows the store's own first hero photo under a dark scrim (`lib/hero-photo.ts`; without a hero photo it is the cream band), with the welcome and what an account is for. The form has "Forgot password?" on the password label row, the sign-in button, then "New here?" and a secondary "Create an account" button. The all-caps "ACCOUNT" label is gone. Phones get the form alone, with the site's 16 px gutters. Below 900 px the card is capped at 520 px so the form never stretches across a tablet.
4. **Not-found page.** Left-aligned with the rest of the site: the heading, one line on what happened, a search box that goes to the shop, "Shop products" and "Track your order", then the shop's real categories on the same cream band as the home page. If the categories cannot be read, the page still renders without that row.
5. **Best sellers (legacy `best_sellers` section type).** The row needs four products. The editor preview names the gap that hides it.
6. **Arabic.** Five new strings for the sign-in panel.

## What the checks found

- **The three-product "Best Sellers" row on the home page is not change 5.** It is a category spotlight for the collection named "Best Sellers", saved with a minimum of 2, so it shows. Setting its minimum to 4 is a store setting in the theme editor. Stored settings are unchanged.
- **Phone 404 overflow (fixed).** The search input's default width pushed the card past the screen edge; the body clips horizontal overflow, so the page-level check read 0.
- **Sign-in gutters (fixed).** A legacy rule sets `main.section > .container` widths with `!important`, which kept the phone card at 12 px gutters; the sign-in page now overrides it.
- **"Forgot password?" tap target (fixed).** Its hit area is 46 px tall on phones, without moving the layout.
- **Top-level unmatched URLs (not changed).** Paths such as `/search` get Next's empty shell from the server, and the branded page appears after the client renders. Routing is unchanged in this sprint.

## Left for the next pass

- Minimum products on the home page's "Best Sellers" category spotlight: owner decision.
- Desktop tap targets under 44 px were not in scope; the 44 px work targets phones.
- Arabic is not tested visually, because this store has Arabic turned off.

## Verification

- `npx tsc --noEmit`: passes.
- `npm test`: 1120 tests pass, 0 fail. `tests/ux-sprint4.test.ts` has 9 tests (stylesheet order, department glyphs, strip layouts and focus ring, cart lane and target sizes, hero photo and URL safety, sign-in markup, not-found search and categories, Best Sellers threshold, Arabic strings). One sprint 2 assertion now checks the department glyph instead of the old grid icon.
- `npm run backend:audit`: passes.
- `npm run build`: passes, 149 static pages.
- Browser audit on the final build, 6 pages at desktop and phone widths: axe reports no violations; no horizontal overflow; no phone tap target under 44 px; no page errors. The only console message is the expected 404 status on the not-found page.
- Crash sweep on the final build: 72 page loads, no 5xx, no uncaught page errors.
- Measured: sign-in card 16 px gutters at 390 px, 520 px wide at 880 px, split from 900 px; cart boxes aligned (row and select-all centres within 1 px); category hover isolated to one card; sign-in submits and lands on the account page.
