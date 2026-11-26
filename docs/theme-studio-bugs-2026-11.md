# Theme editor: bugs found by using it (November 2026)

Branch `claude/theme-studio-bugs`, based on `origin/main` at fc0bc07.

## How it was checked

The theme editor was used in a production build, signed in as the local admin (password and 2-step code), with an automated browser. Every request, console error and page error was recorded.

- **Every section type:** each one in the add list was added to the homepage. The page was saved, reloaded and published through the review.
  - The editor's preview and the live shop were then compared section by section, at computer and phone width.
- **Editing:**
  - a heading typed into a section;
  - move up and down, duplicate, undo and redo;
  - hide, and delete with its confirmation;
  - save, discard;
  - the Desktop, Tablet and Phone sizes;
  - the Arabic edit mode;
  - all six page templates (Home, Product, Collection & shop, Cart, Blog, Pages).
- **Publishing:** a new primary colour and an Arabic heading. Checked on the live shop in English and in Arabic, and in the version history.

What worked: everything above, apart from the three bugs below. The preview and the live shop showed the same sections in the same order. The only differences are the editor's own "hidden on your store" notes.

## Fixed

- **"Footer" in the homepage add list made a second footer row that did nothing.**
  - The store has one footer, set in Theme settings › Footer.
  - The homepage list no longer offers it, like the header and the announcement bar (`components/theme-studio.tsx`).
- **The cookie notice showed inside the editor's preview,** over the bottom of the page being designed. A click on it there would have saved the owner's own cookie choice. It is now left out there, as the welcome and notification pop-ups already were (`components/cookie-consent.tsx`).
- **A "Logo list" with no logos left a blank band on the shop:** the section's spacing around nothing. Now it shows a note in the editor and nothing on the shop, like the other sections that can be empty (`components/storefront-sections.tsx`).

## Checked, not a bug

- **Pictures and `theme-fallback.css` answered 404 in the local build.** `next start` runs the store's request filter on files too. On Cloudflare the files are served first: on the live site all four answered 200 with the right types.
- **Ad pixels:** with consent given and a pixel ID set, nothing loaded on admin pages or in the editor's preview.

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- `tests/theme-studio-bugs.test.ts` adds 3 tests.
- After the fixes, the browser run had no issues:
  - the add list offers 34 types, without Footer;
  - undo and redo work;
  - the preview matches the live shop at both widths;
  - the cookie notice is gone from the preview.
