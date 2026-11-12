# Homepage motion (November 2026)

Branch `claude/home-redesign`, based on `origin/main` at 378572b (after #606). This round adds motion to the market homepage: the hero, the sections as they scroll in, the product cards and the cart count. The identity passes in `app/storefront-market.css` set the look (the speed-lines mark, red outlined product buttons, the cream band, Bricolage headings), and this round keeps them. The motion builds on that look, and the speed lines are its signature.

## Rules the motion follows

- Only `transform` and `opacity` move (the speed-lines mark also animates its background size). Nothing moves the layout: CLS stays 0, including while scrolling.
- Each animation runs once, for under a second (the hero photo's settle takes 2.4 s), with the theme's ease-out curve (`--mk-ease`). Product cards cascade 60 ms apart.
- Visitors who ask for less motion (`prefers-reduced-motion: reduce`) get none of it. The hero starts stopped, nothing is held back on scroll, and the progress bar is replaced by the plain white dot. `tests/home-redesign.test.ts` checks that every animation in `app/storefront-motion.css` sits behind that preference, except the dot's progress bar, which the reduced-motion block hides.
- Nothing that is already on screen is ever hidden and shown again.

## What changed

1. **Hero rotation controls (WCAG 2.2.2).** The slides had no pause control, and they kept turning while a keyboard user was inside them. Changes, in `components/market-sections.tsx`:
   - A pause/play button is the first control in the dots row, with the same 44 px target as the dots ("Pause slides" / "Play slides", in Arabic too).
   - Rotation holds while a mouse is over the hero, while keyboard focus is inside it (`:focus-visible`, so a mouse click on an arrow does not freeze it), and while the hero is off screen or the tab is hidden.
   - A tap on a phone no longer freezes the slides. The old `mouseenter` hold fired on taps; the hold now checks for a mouse pointer.
   - The slides never turn in the theme editor, as before.
   - Screen readers hear a slide the visitor moves to (`aria-live="polite"`), but not each automatic change.
2. **Progress on the active dot.** While the slides turn, the active dot fills over the slide's time (the section's speed setting, passed as `--mk-hero-speed`). The timer keeps the time left during a hold, so the bar and the slide change stay together. In Arabic the bar fills from the right.
3. **Hero entrance.** Each time a slide comes on screen, the speed lines streak in (the long middle line first, as in the logo), then the tag, the headline, the line of text and the buttons rise in, 80 ms apart. The photo settles from a slight zoom; it is clipped to its own slide.
4. **Phones: room for the controls.** The controls row sat right under the hero buttons. The words now end 12 px higher and the row 8 px lower, so a thumb on the pause button never lands on "Shop now".
5. **Sections rise into view.** Section titles, the spotlight banner, product rows, offers, departments and the trust strip rise in as the shopper scrolls to them. In product rows and other groups, each item follows the one before. Each section title's speed-lines mark draws itself.
   - `components/scroll-reveal.tsx` holds back only what starts fully below the first screen. Without JavaScript, without IntersectionObserver, or when printing, everything shows as it is.
   - It is mounted on the market homepage only, never in the theme editor.
6. **Product cards: second photo on hover.** A card whose product has a second photo crossfades to it while the mouse is over it.
   - The photo is fetched on the first mouse hover, so phones, and cards nobody points at, never download it.
   - It is decorative (`alt=""`), so the card's name for screen readers does not change.
   - This applies wherever the market card is used, including the shop and collection pages.
7. **Feedback on add to cart.** The "Added" check pops in, and the cart count in the header pops when something is added. It does not pop when the saved cart loads, or when something is removed. The market header switches off animation on the count, so the pop overrides that only while it plays.
8. **Pointer feedback.**
   - Promo banners (offers and the spotlight banner): a light sweep crosses the photo, under the words.
   - Department glyphs give a small nod.
   - "Shop all" links end with a chevron that leans toward where the link goes, mirrored in Arabic.

All of this is in `app/storefront-motion.css`, imported last in `app/layout.tsx`.

## Not changed, on purpose

- **CSS scroll-driven animations.** The store sets `overflow-x: hidden` on `<body>`, which makes the body the nearest scroll container. `animation-timeline: view()` then never moves, so the reveals use IntersectionObserver instead, which also covers browsers without scroll timelines.
- **The header is meant to be sticky but is not (owner decision).** The header is styled `position: sticky`, and `StoreNavScroll` adds a "scrolled" style to it. But `overflow-x: hidden` on `html` and `body` (from #506) stops sticky positioning across the whole store, so the header, the shop filters and the product gallery all scroll away.
  - `overflow-x: clip` would keep the same clipping and bring sticky back. That change affects every page, and a sticky header takes room on phones, so it is left for the owner.
  - The previous homepage pass left one owner decision open, the speed lines on the phone hero. The orange phone rule in `storefront-market.css` now covers it.
- **No looping or ambient motion.** Nothing moves on its own except the hero's progress bar while the slides turn, and the pause button stops that.

## Verification

- `npm run typecheck`, `npm test` (1130 pass; `tests/home-redesign.test.ts` adds 6 tests), `npm run backend:audit`.
- `npm run build:cloudflare` with the CI environment, including the worker charset check: both bundles Latin-1 only.
- In the browser (37 checks, no page errors):
  - Hero rotation and holds:
    - The slides turn after 5 s.
    - They hold on mouse hover, on keyboard focus, off screen, and when stopped. A mouse click on an arrow does not hold them.
    - Play from the keyboard starts at once.
    - Reduced motion: the hero starts stopped, nothing turns, and nothing is held back.
  - The pause button is 44 × 44 px.
  - Reveals:
    - Only blocks fully below the first screen are held.
    - All of them show after scrolling.
    - The speed lines end at their full size.
  - Cards and cart:
    - The second photo crossfades on mouse hover, and is never fetched on touch.
    - The cart count pops on add, not on load.
  - On phones the controls row is below the hero buttons. In Arabic the progress fills from the right and the chevron points left.
- UX audit, 6 pages at desktop and phone widths: axe reports no violations and no phone tap target is under 44 px. The results match the last round, plus the new button.
- Crash sweep: 72 page loads, the same statuses as the last round, no 5xx, no page errors.
- Web vitals on a throttled phone (slow 4G, 4x CPU) are unchanged: LCP 2.85 s (the hero photo), FCP 1.24 s, CLS 0, 181 ms of blocking time. CLS is also 0 while scrolling through every reveal at 1280 and 390 px. Page heights are unchanged.
- For these checks the local database's placeholder product photos were swapped for crops of the stock photos in `public/stock`, a local copy that is not committed.
