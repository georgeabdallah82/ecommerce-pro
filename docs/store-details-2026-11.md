# Store details: rating summary, questions, wallet history, notifications (November 2026)

Branch `claude/store-more`, based on `origin/main` at 582ed7c (after #611). A survey of what a returning shopper sees after the earlier rounds:
- Already looked finished, unchanged: the cart drawer, the phone menu and the product page's pinned "Add to Cart" bar.
- Changed: four details, one of them a layout bug.

New styles are in `app/storefront-details.css`, imported last.

## What changed

1. **The wallet's history (a bug).** Each line printed the entry's code, the store's note and the date with nothing between them: "DEBITLive check concurrent debit11/12/2026, 2:04:07 PM". The code was English capitals on the Arabic page too.
   - Each line now reads as words: "Credit removed", "Credit added", "Used at checkout", "Earned", "Refund", "Returned to you", and so on, in both languages.
   - Under the words come the store's note and the date ("Nov 12, 2026, 2:04 PM"), then the amount.
   - Money and coins coming in are marked in green with a plus; going out, with a minus.
   - Coin amounts have thousands separators ("−19,800"; it was "−19800").
   - The two balances have the dashboard tiles' icons.
2. **A rating summary above the reviews.** The average and a count sat beside the heading. Now a card opens the reviews:
   - The average in large type, its stars, and how many reviews there are.
   - A bar for each star, 5 to 1, with how many gave it.

   Screen readers hear "Rated 4.7 out of 5" and "5 stars: 2". In Arabic the bars fill from the right.

   The counts cover every approved review, not only the 24 the page lists. That also fixes the review count at the top of the page, which read "24 reviews" for a product with more.
3. **Questions, before the first one.** The section was a heading and an "Ask a question" button. It now also says "No questions yet. Ask one and we will answer it here.", with the button beside it on wider screens.
4. **Notifications.**
   - Each has an icon for what it is about: an order placed, an order on its way, a refund, a gift card, or a bell for anything else.
   - Unread ones sit on the brand cream.
   - The date drops the seconds.
   - The stored title and text (written in English) keep their own direction on the Arabic page.

## Not changed, on purpose

- **What notifications say.** They are stored as finished English sentences when they are sent, so they are not translated here. Translating them would mean storing what happened instead of the sentence: a larger change.
- **The wallet notes.** "Checkout coin redemption" and the like are the store's own notes, shown as written.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1168 tests; `tests/store-details.test.ts` adds 6, including the rating breakdown's counting.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- In the browser, signed in, at 1280 and 390 px and in Arabic, with three local test reviews (removed afterwards):
  - The rating bars read 67 %, 33 %, 0, 0, 0 for two 5-star reviews and one 4-star review.
  - Every wallet and coin line is words, translated in Arabic.
  - No sideways scroll.
- axe found no violations on the product page, the wallet and the notifications, at both widths and in Arabic.
- UX audit of 9 pages at both widths:
  - No axe violations.
  - No phone tap target under 44 px.
  - No text under 12 px.
  - No sideways scroll.
- Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
- The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) from the earlier rounds still pass.
