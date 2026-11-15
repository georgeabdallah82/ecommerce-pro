# Admin › Discounts, gift cards and customer segments (November 2026)

Branch `claude/admin-discounts`, based on `origin/main` at 3a1a8bf (after #631).

## What was wrong

**The four create and edit forms** were overlays, not dialogs: no dialog role or name, Tab walked into the page, and Escape did nothing. They are the discount form, Issue a gift card, Manage a gift card and Create a segment.
- **Gift cards and segments:** their first box used `autoFocus`, which took focus before the dialog could note what opened it. So closing returned focus to nothing.

**The three lists:**
- The last column had an empty header.
- The empty-state heading skipped a level (h3 under the h1).

**axe found:**
- an unnamed status filter on Discounts and on Gift cards;
- an unnamed search clear button and an unnamed Close button on Discounts;
- on phones, a sideways-scrolling table the keyboard couldn't reach on Gift cards and Segments.

## What changed

- **`coupons-admin-pro.tsx`, `gift-cards-admin.tsx`, `customer-segments-admin.tsx`:**
  - **The forms:** each is a dialog named by its heading and uses `useModalFocus`. Focus starts in the first box, Tab stays inside, and Escape returns focus to the button that opened it. The discount form doesn't close while it saves.
  - **The lists:** the actions column is named, empty states are level-2 headings (drawn as before), and the filters, search, clear and Close buttons are named.
  - **Phones:** the scrolling tables are named regions the keyboard can reach.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-discounts.test.ts` adds 2 tests.
- `npm run build:cloudflare` with the CI environment passes.
- **10 browser checks pass on the production build:**
  - axe finds nothing on Discounts, Gift cards and Customer segments, on a computer and a phone, and there is no sideways scroll;
  - each of the three create dialogs works from the keyboard and returns focus to its button;
  - no page errors.
- Nothing was saved.
