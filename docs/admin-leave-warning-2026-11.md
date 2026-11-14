# Admin › Leaving a page with unsaved changes (November 2026)

Branch `claude/admin-leave-warning`, based on `origin/main` at 1b7ee46 (after #622).

The Settings round (`docs/admin-settings-2026-11.md`) left this for its own change.

## What was wrong

**Eight admin editors keep track of unsaved changes:**
- Settings;
- a product, a collection, a customer;
- policies and the navigation menu;
- suppliers;
- the theme editor.

**Each one warned only when the tab was reloaded or closed.** Leaving any other way lost the changes without a word. Measured on main, after typing in each editor:
- **The sidebar:** its Dashboard link went straight to the Dashboard (Settings, product, collection, customer).
- **The admin search:** its results did the same, through the same kind of link.
- **The browser's Back:** after arriving from another admin page, Back (or a swipe on a phone or trackpad) left at once (Settings, product).

**Only two editors asked first,** and only on their own back arrow:
- The product's arrow asked "Discard unsaved changes?".
- The customer's arrow asked too, but had no name for screen readers.

## What changed

1. **`components/use-leave-guard.ts`** (new) is one guard for every editor. `useLeaveGuard(dirty)`:
   - **Admin links:** the admin's own dialog asks "Leave without saving?". The answers are "Stay on this page" (focused, the safe choice) and "Leave without saving".
   - **Back and Forward:**
     - The step is held while the dialog asks, and taken if the person chooses to leave.
     - This uses the browser's Navigation API, which lets a page hold a same-page Back step. It was checked in Chromium, the engine of Chrome, Edge and Samsung Internet.
     - Where a browser can't hold the step, Back leaves as before.
   - **Reloading, closing the tab and plain links** keep the browser's own warning, as before.
   - **Once the person has chosen to leave,** nothing asks a second time.
2. **`components/admin-link.tsx`:** every admin link asks first through Next's `onNavigate`, which runs only for in-app navigation.
   - This covers the sidebar, the top bar, the search and the links inside pages.
   - A link opened in a new tab, or to another part of the same page, doesn't ask.
   - While it asks, the loading bar at the top (`components/nav-progress.tsx`), which starts on every click, stops: nothing is loading.
3. **The eight editors use the guard** in place of their own reload warnings:
   - The product's and the customer's back arrows now ask the same question as everything else.
   - The customer's back arrow is named "Back to customers".
4. **Leaving on purpose doesn't ask.**
   - **No question:**
     - opening a new product's page after it is first saved;
     - going back to the list after a delete;
     - Settings' Discard, which has asked already.
   - **Still asks:** a theme version restore while there are unsaved changes, as before (the browser's warning).

## Not changed, on purpose

- **The theme editor's back link** is a plain link out of the full-screen editor, so the browser's own warning covers it, as before.
- **Editors that don't track unsaved changes** are left as they are. They have no state to guard; the guard is one line for any editor that adds it.
- **Back in a browser that can't hold the step** leaves as before. Reload and close still warn there.
- **Server routes** are unchanged.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-leave-guard.test.ts` adds 4 tests, and the Settings test now checks the shared guard.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **Before (main build):** each of the four editors tried left from the sidebar's Dashboard link at once, with no question. Back left Settings and a product at once. Only the product's own back arrow asked.
- **36 browser checks pass on the production build:**
  - **Every editor but the theme editor:** with a change in Settings, a product, a collection, a customer, a policy, the menu and suppliers:
    - the sidebar's Dashboard link asks first, and the page stays;
    - Stay keeps the page and the change;
    - Leave goes, without a second question from the browser.
    - On Settings, the loading bar stops while the question is open.
  - **Other links:**
    - with nothing unsaved, a link just goes;
    - a search result asks first;
    - the product's and the customer's back arrows ask the same question.
  - **Back:** on Settings and on a product reached by a link, Back asks first; Stay keeps the page; Leave takes the step.
  - **Leaving on purpose:**
    - after saving, a link just goes;
    - Settings' Discard asks once.
  - **Theme editor:** its plain back link gets the browser's warning, and stays when that is dismissed.
- **The local store was left as it was.** The database was restored from the dump taken before testing.
