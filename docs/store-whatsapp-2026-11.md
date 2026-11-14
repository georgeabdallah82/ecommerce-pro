# The WhatsApp button at rest (November 2026)

Branch `claude/store-whatsapp`, based on `origin/main` at 8b47073 (after #617).

The realistic-store round (`docs/store-real-2026-11.md`) left the WhatsApp button resting on whatever was in its corner of the screen. On phones it slid away while the shopper scrolled down, and it stepped aside for keyboard focus. Once the page came to rest, though, it covered what was under it.

For this round the button was switched on locally with a test phone number. It was then measured on 15 pages at 1280 px, 390 px and 390 px in Arabic, at three points on each page: the top, partway down, and the end. That makes 135 states. The theme was restored byte for byte afterwards.

Before, the button sat on a link, button or field in 55 of the 135:
- **"Cookie settings", at the end of every page on a phone.** The footer's last row could never be scrolled clear of the button.
- **The phone cart's sticky "Checkout" bar, in every state.** The button sat above a product page's buy bar, but not above the cart's.
- **Other things in its corner:**
  - a card's heart
  - "Shop all"
  - the product page's "Description" and "Ask a question"
  - the email field
  - the footer's "WhatsApp us"
  - the wholesale form's fields
  - footer links in Arabic

New styles are in `app/storefront-whatsapp.css`, imported last. The placing is `placeButton` in `components/market-chrome.tsx`.

## What changed

1. **At rest it no longer covers a link, button or field.**
   - It checks its corner whenever:
     - the page comes to rest
     - focus moves
     - something is clicked (an accordion opens)
     - an animation ends (cards that slide in on the home page)
     - a new page opens
   - If something to click or type in is under it, it rises above it, up to twice its own height.
   - Where there is no room, it slides away, as it already did for keyboard focus, and comes back at the next rest. Examples are the footer's link columns in Arabic, which sit on the right, and a phone cart's rows.
   - It may still rest on the corner of a large link, such as a product card's photo or an offer tile, but never on its middle. Here "large" means at least two and a half times the button's size each way.
   - The focused element is never under it. While a focused field is scrolled into view, the button moves at once, as before.
2. **The end of every page leaves room for it.**
   - The footer's bottom padding is now the button's size plus its distance from the edge plus 12 px: 86 px on wider screens and 78 px on phones.
   - So the copyright line, "Cookie settings" and the payment badges can be scrolled clear of the button.
3. **The phone cart's checkout bar.**
   - The button now sits above the bar, as it does above a product page's buy bar.
   - The end of the page leaves room for the bar as well. Before, the footer's last row stayed behind the bar, with or without the WhatsApp button.

How it moves:
- The rise uses the CSS `translate` property, so it adds to the hover nudge and to the slide-away.
- The slide-away when there is no room uses the same style as the slide-away for keyboard focus.
- With reduced motion, it moves without animating.

## Not changed, on purpose

- **It is still a floating button.** It can pass over text and photos while the page scrolls, and rest on the corner of a product card or an offer tile. Hiding it whenever anything at all is under it would hide it most of the time on product grids.
- **On phones it still slides away while scrolling down**, and comes back on a scroll up.
- **Its settings are unchanged:** size, colour, the left or right side, and "show on phones". The owner can still turn it off on phones in the theme settings.
- **The theme editor's preview** uses the same component. It wasn't opened in a browser here, because the admin needs two-step sign-in.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/store-whatsapp.test.ts` adds 6 tests.
  - One earlier check (`tests/store-real.test.ts`) read the old keyboard-focus code line by line.
  - It now reads the new code. The rule is the same: focus is never under the button.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **Every page, before and after.** The 135 states were measured on the button where it really is, counting only the visible part of each link, button or field:
  - It covered one in 55 states before, and in none now.
  - It rose 33 times and stepped aside 11 times.
- **Keyboard.** Tab was pressed through the home page, shop, a product page and the cart at all three sizes, 89 stops each.
  - Once the page settles, no focused element is under the button.
  - While focus is scrolled into view smoothly, the button clears it within 150 to 300 ms.
- **It stays put.** At rest it didn't move once in 12 seconds, including under the home page's moving hero.
- **The end of the page.** Scrolled to the end, the footer's last row ends above the button on a desktop and on a phone.
- **The phone cart.**
  - The button sits above the checkout bar.
  - At the end of the page, the footer's last row also ends above the bar.
- **The button itself.** It is on top where it shows and opens WhatsApp (`wa.me`) in a new tab. Hovering still nudges it up, and with reduced motion it moves without animating.
