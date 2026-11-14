# Admin › Products: the product editor and the products list (November 2026)

Branch `claude/admin-product-editor`, based on `origin/main` at 5da85b4 (after #623).

## What was wrong

These were measured on main against the local scratch store.

**Making variants**
- **Typing an option's values one key at a time lost the commas.** "S, M, L" came out as "SML": each comma disappeared as it was typed. Generate variants then made a single variant, "SML". Pasting the values worked.

**Saving**
- **Discard after a save went back to the page as first loaded.**
  - After a new price was saved, a later Discard showed the old price again.
  - The next save then wrote the old price back.
- **Duplicate with unsaved changes made the copy first.**
  - Then the browser asked about leaving the page.
  - Choosing to stay kept a copy nobody had opened. Each try made another.
- **The Save bar went out of sight when scrolling down with unsaved changes.**
  - **On a computer:** the product's title bar stuck at the top of the window, under the app's own top bar. Half of it was hidden, and it covered the Save bar and the section tabs.
  - **On a phone:** the tabs went under the app's top bar.
- **A refused save said why at the top of the page,** out of sight from where Save was pressed.

**Wrong information**
- **The readiness strip** warned "Active, but not on any sales channel yet" for every product never changed on the Channels tab. Those products are on the Online Store.
- **Margin** showed 0% when the price was below the cost.
- **The list's view counts** came from the rows on screen. On the Draft view, All read 1 and Active read 0, out of 6 and 5.
- **The list's Sales channels column** said "Online Store" on every row, including products taken off it.
- **Featured** showed in the editor's summary but couldn't be changed there.
  - It decides what comes first on the home page and among suggestions in the cart and on product pages.
  - The only way to set it was a bulk action on the list.

**Keyboard and screen readers**
- **Collections couldn't be chosen from the keyboard.** Tab from the search box closed the list, and focus was lost.
- **Tags:**
  - The field's label named the first remove button, not the box.
  - The remove buttons were named "×".
- **Variant rows:** 8 boxes and 2 remove buttons had no name (axe).
- **The section tabs** didn't say which one was open.
- **Other names:**
  - The image arrows were named "↑" and "↓".
  - The description box was named "Text".
  - The price boxes were named "Price$".
- **Page structure:** the page had a second `<main>` inside the layout's, and the cards' headings skipped from level 1 to level 3.
- **A focused price box** showed only a faint ring inside it. Other boxes get the accent border.
- **The list:**
  - "More tools" didn't move focus into its menu, and Escape didn't close it.
  - The bulk "More" button didn't say whether it was open.
  - The results of bulk actions weren't announced.
  - Statuses read "DRAFT".
  - The last column had an empty header.
- **The list asked for its first page twice:** once with the page, then again as it opened. On a host with a tight CPU limit, each extra request is another chance of the error in `docs/admin-load-errors-2026-11.md`.

## What changed

1. **`lib/product-editor.ts` (new)** holds small helpers, tested on their own:
   - reading option values and tags;
   - working out margin and profit;
   - the channels a product is on;
   - the list's view counts.
2. **`components/product-editor-v2.tsx`**
   - **Option values:** each values box keeps exactly what was typed. "S, M, L" makes S, M and L. Repeats and blanks are dropped.
   - **Discard** goes back to the product as last saved.
   - **Duplicate with unsaved changes asks first:** "Duplicate without your changes?"
     - It explains that the copy is made from the saved version.
     - The answers are "Keep editing" and "Duplicate saved version". The copy then opens without the browser's warning.
   - **The Save bar and the tabs stay in view together,** just below the app's top bar. The title bar scrolls away.
   - **Save problems show in the bar:** "Not saved: …".
     - A missing title, a missing SKU, or a crossed-out price that isn't above the price opens the right tab and focuses the box.
     - A new product shows the bar as "Unsaved product".
   - **The readiness strip** counts a product as on every active channel unless it was taken off one. The Channels tab and the store already read it that way.
   - **Pricing** shows the margin and the profit per item.
     - Below cost, both are negative and red, with "The price is below the cost per item: each sale loses $11.00."
     - With no cost entered, the card says what the cost is for.
   - **Featured** is a tick box in Organization: "Comes first on the home page and among the suggestions in the cart and on product pages."
   - **Collections from the keyboard:**
     - The list stays open while focus is in the picker, so Tab and the arrow keys reach its tick boxes.
     - Escape closes it and returns to the search box.
   - **Tags:** the box is labelled "Tags", and each remove button names its tag. "summer, gift" adds two tags. A tag the product already has isn't added again.
   - **Names:**
     - **Variant rows:** each box and remove button is named for its variant ("M price", "Remove variant M").
     - **Options:** "Option 1 name", "Option 1 values", "Remove option 2".
     - **Images:** each image is a group, "Image 2", with "Move earlier", "Move later", "Make main" and "Remove".
     - **Other boxes:** the description box is "Description", the price boxes are "Price", and the size guide's help is a description rather than part of its name.
   - **Structure:**
     - The sections are tabs: the open one is "selected", and the arrow keys, Home and End move between them.
     - The cards are level-2 headings.
     - The second `<main>` is gone.
3. **`components/admin-product-editor.module.css`**
   - The title bar is no longer sticky; the new `.stickyBand` holds the Save bar and the tabs.
   - A focused price box shows the accent border and ring on the whole box.
   - The pricing card shows margin and profit side by side.
4. **`components/admin-products-list.tsx`**
   - **The view counts** come from the server: every view is counted for the current search, whichever view is open.
   - **The menus:** "More tools" and the bulk "More" use the shared keyboard menu (`components/admin-menu.tsx`).
   - **The Sales channels column** lists the channels each product is on, or "Not on any channel".
   - **Announcements:** bulk results are announced, and errors are alerts.
   - **Labels:** statuses read "Active", "Draft" and "Archived". The last column is named "Open" for screen readers, and each row's Open link names its product.
   - **No second request:** the first page isn't asked for again when the list opens.
5. **`app/admin/products/page.tsx` and `app/api/admin/products/route.ts`** send:
   - the view counts, as three counts;
   - the active channels;
   - the products taken off a channel, read in one query beside the rows.

   `ProductPublication` has no relation on `Product` to include it through.
6. **`components/admin-nav.module.css`:** under 900px the top bar is 58px tall, and `--admin-topbar-h` now says so.
   - Bars that stick under it used 64px and left a 6px strip where the page showed through.
   - This also applies to Settings' and the other editors' unsaved-changes bars, and the lists' bulk bars.

## Not changed, on purpose

- **Preview** opens the product's store page in a new tab, as before.
- **The money boxes still show "$".** The store's currency isn't read there, as before.
- **Stock split across locations** stays read-only in the editor and is edited on the Inventory page, as before.
- **Removing a variant with its trash button** doesn't ask first. Nothing is removed until Save, and Discard brings it back.
- **The list's search** runs on Enter, as before.

## Verification

- **Checks:** `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-product-editor.test.ts` adds 27 tests.
- **Cloudflare build:** `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **Before (main build):** what is listed under "What was wrong" was measured in the browser:
  - the "SML" variant;
  - the copy made while staying;
  - the counts on the Draft view;
  - the Tab that lost focus;
  - axe's findings.
- **axe at 1440, 1280, 900 and 390 px** found nothing on the list, on each of the editor's seven tabs and on a new product (36 page and width pairs).
  - On main it found the second main landmark, the skipped heading level and the list's empty header.
  - With variants, it found 8 boxes and 2 buttons without names.
  - No page scrolls sideways.
- **34 browser checks pass on the production build:**
  - **The list:**
    - no second request on opening;
    - counts that stay right on the Draft view;
    - "Draft" as the status;
    - both menus from the keyboard;
    - a bulk result announced;
    - "Not on any channel" for a product taken off the Online Store;
    - no sideways scroll at 900px.
  - **The editor:**
    - one main landmark and heading levels in order;
    - tabs with the arrow keys, Home and End;
    - no false channel warning;
    - every name listed above;
    - Featured;
    - tags;
    - collections from the keyboard;
    - the focus ring;
    - margin and profit at and below cost;
    - Save and the tabs in view at the bottom of the page;
    - a refused save explained in the bar;
    - a missing SKU;
    - Discard after a save;
    - "S, M, L" typed key by key;
    - axe on the Variants tab;
    - Duplicate with unsaved changes;
    - no page errors.
  - **Phone and a new product:**
    - Save and the tabs in view on a phone;
    - "Unsaved product", and a missing SKU on a new product;
    - axe on a new product.
- **4 checks of the sticky bars:** on the product page and on Settings, they sit flush under the top bar, at 64px on a computer and 58px on a phone.
- **The local store was left as it was.** The checks save prices, run a bulk action and make a copy, and the database was restored from the dump taken before testing.
