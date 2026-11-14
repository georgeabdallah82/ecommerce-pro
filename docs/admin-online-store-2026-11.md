# Admin › Online store: the overview and the theme editor (November 2026)

Branch `claude/admin-online-store`, based on `origin/main` at 2ffb63e (after #618).

Both pages were surveyed in a browser at 1440, 1280, 900 and 390 px, with axe, the keyboard and the network log. Sign-in used the real login and two-step flow on the local scratch database. The local admin's two-step was enrolled for the run, as local test data.

## What was wrong

**The overview** (Admin › Online store):
- **It was mostly fixed text.**
  - "Store setup" said "Ready" for the theme, product templates, search, the menu and checkout, whatever the store's state.
  - It also offered "Connect in settings" for a domain.
  - The "preview" was a made-up black banner ("Everything you need.") that looked nothing like the store.
  - The blog's address was "yourstore.com/blog".
- **Its links were a long unstyled list.** The page used global tile classes whose styles no longer exist.
- **Other gaps:**
  - Its heading said "Storefront", while the menu calls the page "Online store".
  - It never said whether there were unpublished changes.

**The theme editor:**
- **The History tab never stopped asking for the version list:** 592 requests in 5 seconds while it was open. With no versions yet it showed nothing at all.
- **The publish review listed changes nobody made.**
  - With nothing to publish, it compared the live theme with a missing draft and listed every setting as changed.
  - It also misled with a real draft. This store's live theme was saved before the current storefront design. The store shows that theme with the new colours, fonts, buttons and header on every page, and the editor opens on that view. The review, however, compared the raw saved data.
  - So hiding one section listed six changes: buttons height, header background and transparency, design, "Edited Product tabs" and "Reordered sections", next to the real one.
- **Its three dialogs (add a section, the review, confirmations) had no keyboard handling.**
  - Focus stayed behind them, Tab left them and Escape did nothing.
  - The section picker had no name and no close button.
  - Every confirmation button said "Confirm", whether it deleted a section or threw away all the changes.
- **Smaller issues:**
  - The Header, Announcement bar and Footer rows were centred, so "Announcement bar" was cut to "Announceme…".
  - Escape didn't close a section's settings.
  - The History list wasn't refreshed after a publish.
- **For screen readers and the keyboard:**
  - The page had no heading.
  - It put a second `main` inside the admin's own `main`, which breaks three landmark rules.
  - The back arrow had no name, and the EN button's name didn't match its text.
  - The preview scrolled but couldn't be reached with the keyboard.

**The admin bar, on every admin page:**
- The account button's name ("Account menu") didn't contain the initials it shows.
- Under 900 px the search button had no name: its text was `display: none`.

## What changed

### The overview (`app/admin/online-store/page.tsx`)

Everything on it now comes from the store's own data (`lib/online-store-overview.ts`, styles in `components/online-store-overview.module.css`).

1. **Your theme.**
   - **Status:** it says "Live" or "Unpublished changes", and when the draft was saved.
   - **Last update:** when the live theme was last written. It names who published it when a saved version matches that time.
   - **Actions:** with a draft, "Review and publish" opens the theme editor with the publish review already open (`?review=1`). Next to it is "Continue editing", or "Customize" when there is no draft.
   - **At a glance:**
     - the brand name and logo
     - the main colours, as swatches, each named for screen readers
     - the fonts
     - how many homepage sections visitors see
     - the languages
     - whether the WhatsApp button is on
2. **Setup.**
   - It is ticked from the store itself, using the same checks the editor's publish review runs (`lib/theme-review.ts`) and the store details the policies use.
   - It checks the logo, the browser tab icon, the menu, the homepage, readable colours, an empty announcement bar (only when there is one), contact details, the policies' details, and whether the store is open to visitors.
   - Each item says what is missing and links to the page that fixes it.
   - Social links and Arabic are optional suggestions: done or not, they never count towards the progress.
   - Staff who can manage settings also get a link to the full launch checklist.
3. **Manage your online store.**
   - Each tile says what it holds:
     - homepage sections
     - links in the menu
     - pages, and how many are visible
     - posts, and how many are published
     - how many of the 6 store details the policies use are filled in
     - redirects, files and custom fields
   - Files, Custom data and Store settings are shown only to staff who can open them.
   - The blog's address is the store's own.
4. **The header.** It reads "Online store", with "View store" (it tells screen readers it opens a new tab) and "Open theme editor".

### The theme editor (`components/theme-studio.tsx`)

1. **History.**
   - Opening the tab asks for the versions once.
   - With none yet, it says "No published versions yet".
   - An error offers "Try again".
   - The list is fetched again after a publish.
2. **The publish review.**
   - With nothing to publish, it says "There are no unpublished changes."
   - It compares what visitors see before and after: the saved values over the defaults, with an older theme converted to the current storefront design, as the store does. `resolveStoredTheme` in `lib/theme.ts` does this, and the store itself now loads its theme through the same function, so the two can't drift apart.
   - A slideshow slide's ID is not a change, because the conversion gives slides new IDs each time it runs. A change to a slide's content or order still is.
3. **The dialogs** use the same keyboard rules as the storefront's pop-ups (`components/use-modal-focus.ts`):
   - Focus moves in, Tab stays inside, Escape closes the dialog, and focus goes back to the button that opened it.
   - The section picker is named "Add to this page" and has a Close button.
   - The confirmation is an alert dialog. Focus starts on Cancel, and the other button says what it does: "Delete section", "Discard changes", "Restore" or "Reset".
4. **Escape closes a section's settings** and puts focus back on its row.
5. **The section rows line up.** Header, Announcement bar and Footer start where the other rows do.
6. **The page itself:**
   - It has a heading, "Theme editor", and the back arrow is named "Back to the online store".
   - The preview size buttons (Desktop, Tablet, Phone) say which one is chosen.
   - The preview is a named region that can be reached and scrolled with the keyboard.
   - There is no second `main`.

### The admin bar (`components/admin-nav.tsx`)

- The account button's initials are drawn by CSS, so "Account menu" is its only name.
- Under 900 px the search button's text is hidden from sight but still read out.

## Not changed, on purpose

- **How the store looks.** Moving the store's theme loading into `resolveStoredTheme` is a straight extraction.
  - 7 storefront pages were compared before and after the change: the home page, shop, collections, cart, blog, about and search.
  - Each matched on visible text, element count, styles, page direction and language.
  - Arabic is off in the local store, so the Arabic pages weren't compared.
- **Saving, publishing and discarding.** Their routes are unchanged. Publishing still needs the "manage content" permission.
- **The editor's layout and tools.** The fixes are inside them.
  - When the editor opens, the Header row is still highlighted: it is the selected section, as before.
- **The menu's name for the page.** It is still "Overview", so the browser tab reads "Overview · Admin".
- **No database changes.**

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass.
  - `tests/admin-online-store.test.ts` adds 15 tests.
  - The existing review tests (`tests/theme-review.test.ts`) pass unchanged.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **axe, at 1440, 1280, 900 and 390 px.**
  - **Before:**
    - The overview had 1 issue at the two wider sizes and 2 at the two narrower ones.
    - The editor had 7 kinds at 900 px, including 3 landmark rules.
  - **After:** none on either page at any size.
  - No console errors, no failed requests and no sideways scrolling.
- **In the browser, 25 checks pass:**
  - History makes 1 request in 5 seconds, down from 592, and says when it is empty.
  - The review says there is nothing to publish. Focus moves in and stays in for 12 Tab presses. Escape closes it and focus returns to the button.
  - The section picker is named, focus starts in its search, and it has a Close button. Tab stays inside, and Escape returns focus to "Add section".
  - Escape closes a section's settings and focuses its row.
  - The Header, Announcement bar and Footer rows start at the same x as a homepage row.
  - The preview size buttons report pressed and not pressed.
  - **With a saved draft** (one section hidden):
    - The overview says "Unpublished changes".
    - "Review and publish" opens the review.
    - The review lists only that one change.
  - **Discarding the draft:**
    - Discard asks in an alert dialog, with focus on Cancel and a button that reads "Discard changes".
    - Escape cancels and returns focus to Discard.
    - Afterwards the overview shows the theme as live.
- **The local store was left as it was.**
  - The test drafts were discarded through the editor, and nothing was published.
  - The live theme, homepage and menu rows had the same checksums before and after.
