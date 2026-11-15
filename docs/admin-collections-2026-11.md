# Admin › Collections: the list and the editor (November 2026)

Branch `claude/admin-collections`, based on `origin/main` at 8eb72cc (after #627).

## What was wrong

**Measured on main, with axe at four widths and the keyboard:**
- **The editor:**
  - It had a second `<main>` inside the admin layout's.
  - **"Add products" wasn't a working modal.** Tab walked off into the page behind it, Escape did nothing, and focus didn't return to the button.
  - **The image buttons were misnamed.** "Collection image" was a `<label>` around them, so it named the first button instead of a field.
  - **An active collection with no active products** said "Visible in the Online Store" and nothing more. Since #627 such collections show in the store's menus and home page, and customers who open one see an empty page.
- **The list:**
  - **"Create collection" opened as an overlay but wasn't marked as a dialog:** no dialog role, no name, no focus handling.
  - **"Add products"** had the same gaps as the editor's.
  - **The actions column** had an empty header.

## What changed

- **`components/collection-editor-shopify.tsx`:**
  - **Add products** uses the shared `useModalFocus`: focus starts in its search, Tab stays inside, and Escape closes it and returns to the button.
  - **The second `<main>`** is now a `<div>`.
  - **The image buttons** sit under a plain heading.
  - **A new note:** when an active collection has no active products, the Visibility card says "No active products yet: it shows in the store's menus and home page, and customers who open it see an empty page. Add products, or set it to Inactive." It is readable in light and dark mode.
- **`components/collections-admin-shopify.tsx`:**
  - Both dialogs use `useModalFocus`.
  - "Create collection" is a dialog named by its heading, with focus in its name box.
  - The actions column is named for screen readers, in its own cell, so the page never scrolls sideways.

## Not changed, on purpose

- **What makes a collection show on the store** is unchanged. Every active collection shows, as the owner chose in #627.
- **The editor's other fields and the list's columns** are unchanged.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-collections.test.ts` adds 3 tests.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **13 browser checks pass on the production build:**
  - **axe:** it finds nothing on the list, a collection with products and an empty one, on a computer and a phone. Each page has one `<main>` and no sideways scroll.
  - **The editor:**
    - Add products from the keyboard: focus starts in the search, Tab stays inside, and Escape returns to the button;
    - the image button is named by its own words;
    - the empty note shows only on the empty collection.
  - **The list:** Create collection and Add products work as dialogs from the keyboard.
  - No page errors.
- **The local store was left as it was;** nothing was saved, and the database was restored from the dump.
