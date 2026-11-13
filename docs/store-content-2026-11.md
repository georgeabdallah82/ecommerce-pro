# Store content: the blog and live delivery tracking (November 2026)

Branch `claude/store-extra`, based on `origin/main` at 56608d9 (after #612). A survey of the pages a shopper reaches outside the shop itself:
- Already looked finished, unchanged: the cookie banner, the newsletter sign-up, the search page with no results and the order emails.
- Changed: the blog and the live delivery tracking page, which had a layout bug.

New styles are in `app/storefront-content.css`, imported last.

## What changed

1. **The blog.** It was a list of small thumbnails, with dates as "11/11/2026" and tags as small red links.
   - The newest post leads as a wide card: the photo on one half; the date, title, excerpt, tags and "Read the article" on the other. On a phone the card stacks.
   - The other posts follow as cards in a grid: photo, date, title, up to three lines of the excerpt, tags.
   - Dates read the way people write them: "November 11, 2026", with the Arabic month names on the Arabic page.
   - Tags are chips. Tapping one still filters the blog by that tag.
   - A post without a photo shows the brand cream with an icon, not an empty box.
   - With no posts, or none with the chosen tag, a card says so and offers "Shop products" or "Clear filter".
   - An article ends with "More from the blog": up to three other posts, newest first.
   - Each card is one link for the keyboard and screen readers: its title. The photo and "Read the article" are the same link for the mouse.
   - The theme editor's preview shows the same list.
   - The old list's styles are removed from `app/storefront-market.css`.
2. **Live delivery tracking (`/track/…`).**
   - **A bug:** the cards touched each other. The page used a spacing class (`space-y-4`) that the store does not have. They are now spaced.
   - The title is now the page's heading; the page had none.
   - The status is in the shopper's language and in the order status colours of the account pages: "Shipped", "تم الشحن" in Arabic. It was English words in a pink pill that stretched across the card on a phone; the pill now keeps its size.
   - The ETA and location tiles have icons. The time drops the seconds: "Nov 13, 2026, 9:46 AM" (it was "11/13/2026, 9:46:37 AM").
   - "Refresh" checks again without reloading the page and the map.
   - A failed check is announced to screen readers.
   - The link at the top: the tracking link usually reaches a guest by WhatsApp, and "Back to account" only led them to the sign-in page. Signed out, it now reads "Continue shopping"; signed in, it is still "Back to account".
3. **Tap targets.** Blog tags and "Read the article" are 44 px tall on touch screens. "Back to blog" is 44 px tall everywhere.

## Not changed, on purpose

- **The cookie banner, the newsletter sign-up and the order emails.** They already match the store.
- **The search page with no results.** It already suggests spelling fixes and links to all products.
- **The map.** It is still Google's embed. Only its frame changed: rounded, 320 px tall on a phone and 430 px on wider screens.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1174 tests; `tests/store-content.test.ts` adds 6, including the date format.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- In the browser at 1280 and 390 px and in Arabic, with three local test posts and a test delivery. They were removed afterwards, and the order's status was put back.
  - The featured card is 362 px tall at 1280 px. Before the fix, a tall photo made it about 660 px.
  - Tracking, signed out: the link reads "Continue shopping". Signed in: "Back to account".
  - The status reads "Shipped", or "تم الشحن" in Arabic, in the shipped colour, at its own size.
  - "Refresh" checks again without reloading the page.
  - No phone tap target under 44 px and no sideways scroll.
- axe found no violations on the blog, an article, a tag with no posts and the tracking page, at both widths and in Arabic. The Google map frame is left out of the scan.
- UX audit of 9 pages at both widths:
  - No axe violations.
  - No phone tap target under 44 px.
  - No text under 12 px.
  - No sideways scroll.
- Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
- The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) from the earlier rounds still pass.
