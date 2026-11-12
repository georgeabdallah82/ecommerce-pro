# Storefront uplift: sticky header and inner pages (November 2026)

Branch `claude/storefront-uplift`, based on `origin/main` at eed2ce2 (after #607). The owner asked for a sticky header, and for the rest of the store to look as finished as the homepage. The identity passes in `app/storefront-market.css` set the look (the speed-lines mark, Bricolage titles, brand red), and this round carries it onto the shop, product and cart pages. New styles are in `app/storefront-uplift.css`, imported last.

## Sticky header

The header was built to stick: the market header is `position: sticky` unless the theme turns it off, and `StoreNavScroll` adds a "scrolled" style to it. Two leftover rules kept that from working.

1. **`overflow-x: hidden` on `html` and `body`** (`storefront-legacy.css`, from #506) made the body a scroll container. A sticky element sticks to its nearest scroll container, and the body never scrolls, so the header scrolled away on every page. So did the shop filters and the product photos, which are sticky too.
   - Market storefront pages now use `overflow-x: clip`, which cuts off sideways overflow the same way without making a scroll container.
   - The admin is left out by its shell, and so are classic-design stores.
   - Browsers without `overflow: clip` (Safari before 16) keep today's behavior.
2. **An 80 px minimum height on the logo.** A placeholder-tile rule in `storefront-legacy.css` made the header 105 px tall on computers and 159 px on phones, for about 50 px of controls. With it undone the header is 75 px on computers and 123 px on phones (menu row and search bar).

How it behaves now:

- **Computers:** the 75 px header stays at the top and gets a soft shadow once the page scrolls. The announcement bar and the category row scroll away.
- **Phones:** while the shopper scrolls down, the first row (menu, logo, account, cart) tucks away, leaving the 68 px search band. It comes back as soon as they scroll up, with the same rhythm as the WhatsApp button.
  - Product pages and checkout have a one-row header, so they never tuck.
  - Focus anywhere in the header brings the whole of it back.
- **Checkout:** the header stays in place, so the form gets the whole screen.
- **Keyboard focus and in-page links** land below the header (`scroll-padding-top`: 90 px on computers, 134 px on phones; WCAG 2.4.11).
- **Other sticky elements:** the shop filters and the product photos stick 92 px from the top instead of 16 px, so they never slide under the header. The cart summary already stuck at 102 px.

### The phone menu and the photo zoom: a scroll lock that never locked

Both "locked" the page by setting `overflow: hidden` on `body`. Because `html` sets its own overflow, a value on `body` never reaches the page's scrolling, so the page behind the menu kept scrolling. It would also have made the body a scroll container again, which unsticks the header. Both now lock `<html>`, so the page stays put behind the menu and the header stays where it is.

## Shop page

- **A visible title.** The page title ("Shop all products", the collection's name, or "Search results for …") was for screen readers only. On market stores it now shows above the results, in the display face, led by the speed-lines mark. The classic design keeps it for screen readers.
- **The "Collections" sidebar heading** was set as a large title, too wide for the 220 px column, so it broke mid-word ("Collection / s"). On computers it is now a small label like "Price" below it.
- **The product count and the sort menu** share the row above the results. The menu sat a row above the count.

## Section titles on the product and cart pages

"Customer Reviews", "Questions & answers", "You may also like" (product page) and "You might also like" (cart) now take the homepage's title style: Bricolage, led by the speed-lines mark, mirrored in Arabic. The rating beside "Customer Reviews" stays in the body face.

## Cart, phones

The reassurance boxes under the total ("Secure checkout", "Fast delivery") were set in three columns. With two boxes, a third of the row stayed empty and the words wrapped in narrow strips. Each box now takes an equal share of the row and reads from the top.

## Not changed, on purpose

- **The footer's brand column** shows the store's tagline and social links when they are set (Theme settings → Footer), and nothing otherwise; it does not invent copy. On this store neither is set, so the column only shows the name.
- **The cart drawer and the phone menu** already had a free-delivery progress bar, suggestions, and labelled sections; they are unchanged.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1138 tests: `tests/storefront-uplift.test.ts` adds 8, and `tests/ux-sprint1.test.ts` follows the visible shop title.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- In the browser, on the homepage, shop, product, cart and checkout pages at 1280 and 390 px:
  - **The header:** on computers it stays at the top, 75 px tall, with its shadow once scrolled. On phones it tucks to the 68 px search band when scrolling down and comes back when scrolling up. On product pages it never tucks (61 px). On checkout it scrolls with the page.
  - **Sticky elements:** the shop filters and product photos never overlap the header.
  - **The phone menu:** the page stays put while it is open, and the header stays at the top.
  - **Keyboard:** tabbing through four pages at both widths, no focused control is ever hidden by the header.
  - **In-page links:** a link to `#reviews` lands below the header.
- UX audit, 6 pages at desktop and phone widths:
  - axe reports no violations, and no phone tap target is under 44 px.
  - The logo link keeps a 44 px height. Without it, the logo fix had made it a small target on every page.
  - Desktop counts match the last round.
- Crash sweep: 72 page loads with the same statuses as before, no 5xx and no page errors.
- Web vitals on a throttled phone (slow 4G, 4x CPU), measured back to back against a build of `main`:
  - LCP median 3.08 s on this branch and 3.12 s on `main` (the hero photo), so no regression.
  - CLS 0, at load and while scrolling.
  - Both numbers are higher than last round's 2.85 s because the local test products now have real photos that compete with the hero photo for bandwidth. That is a stand-in for the live catalog, which already has photos.
