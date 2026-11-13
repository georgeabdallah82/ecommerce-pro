# Store pages: sign-up, password pages, checkout on phones, policies, stores (November 2026)

Branch `claude/store-next`, based on `origin/main` at eac007f (after #610). A survey of the pages the earlier rounds had not reached:
- Already looked finished, unchanged: order lookup, the 404 page and wholesale.
- Changed: sign-up, the password and email-confirmation pages, the policies and the stores page, plus one accessibility fault in the phone checkout.

New styles are in `app/storefront-pages.css`, imported last. The sign-up and password styles are in `app/storefront-account.css`.

## What changed

1. **Create account.** It was a small form with placeholder-only fields. It now matches the sign-in page:
   - On computers, the store's own first hero photo with what an account is for ("Track every order", "Keep your wishlist and addresses", "Check out faster next time").
   - Every field has a visible label. Placeholders vanish as you type.
   - The browser is told what each field is: name, email, new password. It can fill them in and offer a strong password.
   - The password rule ("At least 8 characters.") sits under the field and is read with it.
   - The limits match what the server accepts: a name of 2+ characters, a password of 8 to 128.
   - "Sign in" is the secondary button, as "Create an account" is on the sign-in page.
2. **Forgot password, reset password, check your email.** Each was a plain form under a small heading. Each is now the sign-in page's card on its own, with an icon (a key, a lock, an envelope), the same fields and buttons, and a way back to sign in.
   - On reset password, the new-password rule moved from a placeholder to a hint under the field.
   - Without its link, the reset button is disabled and now looks it.
   - The "send the link again" form has a label tied to its field.
3. **Checkout on phones: fields no longer hide behind "Place order".** The pinned bar is about 130 px tall. Moving through the form with Tab or the keyboard's next key used to leave fields fully under it (WCAG 2.4.11):
   - At 390 × 844: First name, Last name, "Share my exact location" and both code links.
   - At 360 × 640: more.

   The page now keeps that strip clear when it scrolls to a field. The bar itself, the order of the page and its contents are unchanged.
4. **Policies (privacy, terms, refunds).**
   - In Arabic, the English policy text was laid out right to left, with each full stop at the start of the line. The policy text now keeps the direction it is written in. Blog posts do too.
   - The text ran about 95 characters to a line at 15 px. It is now 16 px, at no more than 68 characters a line, under a larger title and a rule.
   - Lists indent on the reading side.
   - The page had no main landmark, so "Skip to content" did nothing. It now goes to the policy. Same for the blog list and blog posts.
5. **Our stores.**
   - Each store is a card: an icon, its name as a heading, the address and the opening hours. "Directions" and "Call" are 44 px buttons; they were bold text links.
   - With no store yet, the page shows the same kind of card as the empty wishlist: "Delivered to your door", the store's sentence about ordering online, and "Shop products".

## Not changed, on purpose

- **The checkout's order.** On phones the total sits above the form, and the full summary follows it. That was a deliberate choice in ux-sprint2 (docs/ux-sprint2-2026-11.md), so the page reads in the order it is seen.
- **Policy headings keep the store's heading font.** `storefront-legacy.css` sets it with `!important` inside the storefront.
- **Small links inside policy sentences** ("order tracking", "Refund Policy") are text links, which the 44 px rule exempts. Their tap area is already enlarged (tests/tap-targets.test.ts).

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1162 tests; `tests/store-pages.test.ts` adds 8.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- In the browser:
  - Sign-up with the new fields lands on "Check your email".
  - A 5-character password is stopped before it is sent.
  - The password field is announced with its rule.
  - Forgot password shows its answer inside the card.
  - Reset password without its link shows a disabled, faded button.
- Checkout, tabbing through every field: no focused control under the pinned bar at 390 × 844 or 360 × 640. Before: 6 and 8.
- axe found no violations on sign-up, forgot password, reset password, check your email, stores, the three policies and the checkout. That holds at 1280 and 390 px, and in Arabic. Before, each policy page had no main landmark.
- UX audit of 9 pages at both widths (home, shop, a product, cart, sign-in and the four account pages):
  - No axe violations.
  - No phone tap target under 44 px.
  - No text under 12 px.
  - No sideways scroll.
- Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
- The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) from the earlier rounds still pass.
- The local test data used for this review (two stores and the sign-up test accounts) was removed afterwards.
