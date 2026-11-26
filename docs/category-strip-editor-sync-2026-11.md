# "Shop by category": the theme editor's settings now reach the shop (November 2026)

Branch `claude/theme-category-sync`, based on `origin/main` at 4ec7d98.

## What was wrong

The owner saw the "Shop by category" section look different between the theme editor, phones and computers. Checked in a production build, with the setting changed in the database and the page opened at phone (390 px) and computer (1280 px) width:

- **"Section width" (Section layout) did nothing.** The strip's own full-width rule (`app/storefront-market.css`) was more specific than the shared section-width rule. Set to the left, it also pushed the row about 20 px past the right edge of the screen, on phones too.
- **"Card position" (left / center / right) did nothing.** The tiles stretched to fill each row (`1fr` columns), so there was never space to move them into.
- **Up to four categories looked like two different designs.** Computers showed wide cards (picture, name, arrow); phones showed small square tiles bunched at the left, with the rest of the row empty.

Heading, "Collections shown" and "Choose collections" already worked the same everywhere.

## What changed (`app/storefront-sprint4.css`)

- **Up to four categories are the same wide cards on phones and computers.** Phones stack them one per line, a little smaller.
- **Section width:** the heading and the categories share one box of that width, centered or lined up with the page's left or right edge. On a phone narrower than the width, it is the full width.
- **Card position:** with center or right, the categories keep their size and each row (the last, part-full one too) sits in the middle or at the right. Left keeps the old look.

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- `tests/store-category-strip.test.ts` adds 2 tests; a test name in `tests/ux-sprint4.test.ts` is updated.
- **Production build, 3 and 9 categories, each setting at 390 px and 1280 px:** the positions of the heading and every category were measured.
  - Section width (700 center, 700 left, 900 right) keeps the box inside the screen.
  - Card position center and right move every row.
  - With 2 or 4 categories, phones show the cards.
- **Theme editor, signed in as the local admin:** its Desktop and Phone previews measured the same as the shop for the same settings.
