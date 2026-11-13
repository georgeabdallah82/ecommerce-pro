# A real store's settings: the storefront checked as a store is really set up (November 2026)

Branch `claude/store-real`, based on `claude/store-links` (#614, not merged yet); it moves onto `main` once #614 is merged.

The last round found three problems that only appear once the store has a phone number. Every earlier check ran on a local store with nothing switched on: no phone or email, no WhatsApp button, Arabic only through the editor's preview, no social links, no logo, no bank transfer, no collection photos, and no sale prices, sizes, sold-out products, reviews or saved items.

For this round the local store was set up like a real one, all temporarily:
- the WhatsApp button on
- Arabic on for customers, so the header shows "العربية"
- Instagram, Facebook and TikTok links
- a logo
- a phone, email and address
- bank transfer
- photos on the three collections
- a sale price, a sold-out product, and a product with two sizes, one of them sold out
- six reviews
- two saved items
- a delivered past order

Every storefront page was then audited at 1280 and 390 px and in Arabic, 99 page loads in all. All of it was put back afterwards, and the theme was restored byte for byte.

New styles are in `app/storefront-real.css`, imported last.

## What changed

1. **The WhatsApp button.**
   - It sat outside every landmark, on every page except checkout (axe: region). It is now in a landmark of its own, named like the button.
   - It rests over whatever is in the corner of the screen: a card's "Add to cart", a heart, the share button, an accordion. A keyboard user could tab onto something it hid completely.
   - While the focused link, button or field is under it, it now moves out of the way, at every width, and comes back when focus moves on. On phones it still slides away while the shopper scrolls down, as before.
2. **Sizes on a product page.**
   - The choices were headed "Options". The heading is now the option's own name when the sizes share one ("Size"). Common names (Size, Color) show in Arabic; others show as the store typed them.
   - The buttons only showed which size was chosen by colour. They are now a named group, and the chosen one says so to screen readers (`aria-pressed`).
   - They were 41 px tall on a phone; they are now 44 px on touch screens.
   - A sold-out size was grey #9ca3af on white (2.5:1). It is now #6b7280 (4.8:1), still struck through on a dashed border.
3. **Tap targets on touch screens:**
   - The search chip on the shop page ("Remove filter: Search: …") was 36 px; it is now 44 px.
   - Checkout's "Have a discount code?" and "Have a gift card?" were 43.5 px; they are now 44 px.
4. **Text under 12 px:**
   - The discount badge on product photos was 10 px; it is now 12 px.
   - Checkout's quantity badges were 11.5 px; they are now 12 px.
   - The date under a notification was 11.7 px on a phone; it is now 12.5 px.
5. **The footer logo.** In the footer's white card the logo was 20 px tall, and 12 px on a phone, where the name couldn't be read. It is now 30 px, and 26 px on a phone.
6. **A saved list.** With items in it, the product names (h3) came straight after the page title (h1) (axe: heading-order). A "Products" heading for screen readers fills the gap, as on the collection page.

## Not changed, on purpose

- **The WhatsApp button still rests on top of content** in the first screen, as floating buttons do. It moves away for keyboard focus at every width, and on phones while the shopper scrolls. The owner can still turn it off on phones in the theme settings.
- **The footer's social icons** are 34 px circles. An earlier round gave them a 46 px tap area that you can't see, so they are 46 px to tap. The same goes for the links in the policy pages' contact block (about 45 px).
- **The courier's delivery list** is still English only, as decided in the last round.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1187 tests; `tests/store-real.test.ts` adds 5.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- The realistic audit: 99 page loads, covering every storefront page signed out and signed in, at both widths and in Arabic, plus the link pages from #614.
  - 68 are fully clean.
  - The other 31 only note the WhatsApp button resting over content in the first screen.
  - None has an axe violation, a phone tap target under 44 px, text under 12 px, sideways scroll, a page error, or more or fewer than one heading.
  - The first run showed the button outside a landmark on 87 page loads, plus the tap-target, heading and small-text problems above.
- In the browser:
  - With a product card and an accordion under the WhatsApp button (phone and desktop), focusing them moves the button away, and focusing elsewhere brings it back.
  - The sizes read "Size" ("المقاس" in Arabic) and announce the chosen one. With one sold out, axe finds nothing.
- An audit note: a full-page screenshot in an emulated phone switches its touch emulation off for the rest of that tab, so touch-screen sizes stop applying.
  - This audit measures each page in a fresh tab, before its screenshot, and confirms touch emulation is on.
  - It also counts a link's invisible tap area, and the label around a checkbox.
- With the realistic settings on:
  - The store-wide UX audit is axe-clean on all 20 page loads. Its 3 small targets on phones are the social icons' visible circles (see above).
  - Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
  - The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) still pass.
