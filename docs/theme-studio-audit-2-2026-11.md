# Theme editor audit, round 2: every setting (November 2026)

Branch `claude/theme-studio-audit-2`, based on `origin/main` at b004bd3. Round 1: `docs/theme-studio-bugs-2026-11.md`.

## How it was checked

The editor ran in a production build, signed in as the local admin, with an automated browser. One section of every type was put on the homepage. Then every control in every tab of every section was changed, and every control on every Theme settings page:

- text boxes, choices, sliders and colours, about 550;
- on/off switches, about 700.

For each change, the editor's preview was compared before and after, then Undo was pressed and the preview compared again. Every "nothing changed" was then checked by hand, in the code or with a targeted test.

**Also checked:**
- **The editor on a phone (iPhone 13 size):**
  - nothing runs off the screen;
  - settings open full width;
  - the Sections / Preview switch works.
- **Undo:** puts back colours (picker, swatch and typed code), choices and text.

## Fixed

- **"Animation" (every section's Advanced tab) did nothing.**
  - None / Fade up / Fade / Zoom only added a class name that no stylesheet uses.
  - The homepage's scroll-in motion (`components/scroll-reveal.tsx`) is the same for every section anyway.
  - The choice is gone; a short note says what happens instead (`components/theme-studio.tsx`).
- **Product tabs replaced the owner's heading.** Before the first sale or discount only the New tab can show, and the section then read "New arrivals" whatever heading was written. A heading the owner wrote is now kept; the standard "Today's deals" still becomes "New arrivals" (`components/market-sections.tsx`).
- **The Collection & shop template only previewed the Shop page.** Its collection-only switches (breadcrumbs, collection description, banner image) never showed anything in the editor.
  - The preview now has a "Shop page / A collection: …" switch (`components/theme-preview-frame.tsx`).
  - The collection view is the same page the live site renders, with the store's first collection.
- **The image banner's Height slider seemed to do nothing.** It only works with "Fixed height" on, and the label now says so (`components/theme-section-inspector.tsx`).

## Checked, working as meant

Settings that changed nothing in the preview, and why:

- **Needs the content first:**
  - Product page: Show vendor, description and specifications accordions need a product with a vendor, a description or specifications.
  - Collection page: description and banner need a collection that has them.
  - A Logo list needs logos.
- **The section is hidden until there are enough products, sales or discounts:**
  - Recently viewed, Bundle & save;
  - Product row before the first sale: the subheading and the #1, #2 ranks;
  - Product tabs' Deals and Best sellers tabs.
- **Shows only on a phone, after an action or for a later visit:**
  - Cart's sticky checkout bar;
  - the newsletter's success message;
  - "Language new visitors see first".
- **Links are left out of the preview on purpose** (announcement strip link, buttons with no label).
- **Colours typed as plain text** that isn't a colour are ignored.
- **The announcement bar, category tabs and the WhatsApp button** all work.
  - They looked silent only because the first test compared other parts of the page.
  - The WhatsApp button is off until switched on.

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- `tests/theme-studio-bugs.test.ts` adds 4 tests.
- **In the browser after the fixes:**
  - an own Product tabs heading shows;
  - the Advanced tab has the note and no Animation choice;
  - the Collection template's preview switches to "A collection: Best Sellers" (the real collection page), and "Show breadcrumbs" now hides and shows its breadcrumbs.
