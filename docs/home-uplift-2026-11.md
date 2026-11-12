# Homepage pass (November 2026)

Branch `claude/home-uplift`, based on `origin/main` at c0ec9e8 (after #605). A front-end review of the market homepage: measured first, then fixed in order of impact. The identity passes in `app/storefront-market.css` set the brand look (the speed-lines mark, red outlined product buttons, the cream band, Bricolage headings), and this pass keeps them.

## How it was reviewed

- Screenshots of every viewport at 390 and 1280 px, and full pages at 768, 1024, 1440 and 1920 px.
- Web vitals on a throttled phone (slow 4G, 4x CPU slowdown): LCP 2.86 s (the hero photo), FCP 1.28 s, CLS 0, 253 ms of blocking time, 490 DOM nodes. Weight: 238 KB of script, 230 KB of images, 79 KB of CSS and 78 KB of fonts (two families, DM Sans and Bricolage Grotesque).
- Computed styles in the browser for the header, the section headings and the cards.

## What changed

1. **Header wordmark (bug).** `components/store-nav-fixed.tsx` set the logo's `font-family` to the theme's font key (`dmSans`) instead of a font stack. No font has that name, so the header wordmark fell back to the browser's serif while the footer used DM Sans. It now uses `fontCssStack(...)`.
2. **Spotlight kicker (bug).** The "Featured" label sat in a grid that stretched it into a dark bar across the banner. It is a compact label again.
3. **Spotlight row.** When the collection has fewer products than the row has slots, the row ended with an empty slot. It now ends with a "Shop all" tile (the same square, ring and radius as a product photo) that links to the collection; on phones it ends the swipe row.
4. **Tablet tier (760-1023 px).** The desktop layouts started at 760 px, where five product columns were about 95 px wide, the spotlight banner was 140 px wide with its title on four lines, the trust strip had four cramped columns, and department card names broke mid-word. That range now gets three product columns, the spotlight stacked over its row, two trust columns and smaller department cards.
5. **Section rhythm.** The trust strip sat 22 px under the spotlight while every other section has the theme's section gap (64 px on computers, 40 px on phones). It now has the same gap.
6. **"Shop all" on New arrivals.** A product row with a single list had no link, unlike the spotlight. It now links to the matching shop sort (`/shop?sort=newest`, or `bestselling` for best sellers).
7. **Department card labels.** A two-line name in a wide department card is left-aligned like the rest of the card (it inherited centring from the tile layout).

## Not changed, on purpose

- **The speed-lines mark and the red outlined "Add to cart" buttons** are the brand's documented signature (identity pass 5). The hero's white lines sit on the same phone screen as the menu button and can read as a second menu; that is a brand decision for the owner.
- **"Cash on delivery" under every price** comes from the theme's card delivery text; an empty value hides it.
- **Performance.** CLS is 0 and blocking time is low. LCP is the hero photo on a slow network: the hero already supports a separate, smaller mobile image (`mobileImageUrl`), and merchant photos would benefit from resizing at the edge (for example Cloudflare image resizing), which this pass does not set up.

## Verification

- `npm run typecheck`, `npm test` (1124 pass; `tests/home-uplift.test.ts` adds 4 tests), `npm run backend:audit`.
- `npm run build:cloudflare` with the CI environment, including the worker charset check: both bundles Latin-1 only.
- In the browser at 390, 768, 1024 and 1280 px: the wordmark renders in DM Sans; the kicker is 84 px wide; the spotlight row ends with the tile; 3 product columns at 768 px and 5 at 1024 px and up; the spotlight stacks below 1024 px; the trust strip has the section gap above it; department names never break mid-word; no horizontal overflow.
- UX audit on the final build, 6 pages at desktop and phone widths: axe reports no violations, no phone tap target is under 44 px, no page errors. Crash sweep: 72 page loads, no 5xx, no page errors. Web vitals unchanged (LCP 2.81 s, CLS 0 on the throttled phone).
