# Admin › Online store: Pages, Blog, URL redirects, Navigation and Policies (November 2026)

Branch `claude/admin-online-store-pages`, based on `origin/main` at 425df1a (after #619).

The last round (`docs/admin-online-store-2026-11.md`) rebuilt the Online store overview, and its tiles now lead straight to these five pages. Each one was surveyed at 1440, 1280, 900 and 390 px with axe and the keyboard. Pages, posts and redirects were also created, edited and deleted for real on the local scratch database, and the result was checked on the store. Everything created was removed afterwards.

## What was wrong

**Pages, Blog and URL redirects** (the same pattern in all three):
- **The add and edit dialogs had no keyboard handling.**
  - They weren't announced as dialogs, and focus stayed on "Add page" behind them.
  - Tab left the dialog 5 times in 14 presses, and Escape did nothing.
  - The close button had no name.
- **A refused save looked like nothing happened.** For example, "cart is a reserved path" appeared on the page behind the dark overlay, out of sight.
- **Content was typed as raw HTML** ("<p>Page content, HTML allowed.</p>").
- **Addresses:**
  - The pages promised "yourstore.com/handle" and "yourstore.com/blog".
  - Renaming a published page's address quietly broke the old one: `/about-us` became "page not found".
- **Blog:**
  - A tag typed without pressing Enter was dropped when the post was saved.
  - The tags' remove buttons had no name.
- **Search fields** had a placeholder but no label, and their clear buttons had no name.
- **axe:**
  - The actions column had no header (Pages and Blog 1, URL redirects 2).
  - The empty state skipped a heading level (h1 to h3).
  - On a phone, the table scrolled sideways but couldn't be reached with the keyboard.
- **The browser tab read "Overview · Admin" on all three.**
  - They weren't in the sidebar, so the tab took the Overview's name and the sidebar lit up Overview.
  - The admin search couldn't find them either.

**URL redirects:**
- **Accepted that shouldn't be:**
  - two redirects leading to each other (`/loop-a` → `/loop-b` → `/loop-a`), which sends visitors round in a circle until the browser gives up;
  - a redirect from `/shop`, which would hide the shop from everyone.
- **Saved as typed but could never match:** a full address pasted as the old one, or one with `?…` after it.
- **Only in production:** redirects only run there; local development skips them on purpose (`lib/edge-db.ts`). So this was checked through what each change saves, not by visiting.

**The menu editor** (Navigation):
- Its example address was "/pages/about-us", but pages live at `/about-us`, so a link copied from the example opens "page not found".
- The store's first menu came with "About" → `/#about`. The homepage has no such section, so the link just opens the top of the homepage. Nothing pointed this out.
- A link to one of the store's pages had to be typed by hand.

**Policies:**
- The tabs had no arrow keys and no panel.
- Each policy card's "Edit" (with an open-in-new-tab icon) switched the editor further down the page, out of sight, so the click looked like it did nothing.

**Two leftovers from the last round:**
- The theme editor opened with the Header row highlighted, though nothing was open.
- Publishing deleted the draft's three rows one by one, so it would fail if one was missing.

## What changed

### Pages, Blog and URL redirects (`components/pages-admin.tsx`, `blog-posts-admin.tsx`, `redirects-admin.tsx`)

1. **One dialog for adding and editing** (`components/admin-form-dialog.tsx`):
   - It is a named modal dialog with the same keyboard rules as the storefront pop-ups (`useModalFocus`):
     - focus starts on the first field and Tab stays inside;
     - Escape closes it, and focus goes back to the button that opened it.
   - The close button is named, and the dialog stays open while it saves.
   - A refused save shows its reason inside the dialog, next to the buttons, and is read out.
2. **Pages and posts are written in the text editor** that Policies already uses (headings, bold, lists, links), not in HTML.
   - The editor's link bar is no longer a form of its own, so it can sit inside these forms. Policies works as before.
   - The editor's text area is named "Page content" or "Post content".
3. **The address:**
   - As you type, the dialog shows the real address on the store's own domain.
   - It warns before saving when the address is already part of the store (such as `/cart`).
   - **Moving a published page or post** offers "Send visitors from the old address to the new one", ticked by default.
     - Saving then adds that redirect (`lib/redirect-moves.ts`), and the page confirms it.
     - A redirect leaving from the new address would hide the page, so it is removed.
4. **Blog:**
   - A tag still typed when the post is saved is kept, and a comma adds a tag too (`lib/tag-input.ts`).
   - Each remove button names its tag.
   - The featured image can be chosen from Files, with a preview, or pasted as an address as before. The picker sits outside the post's form: its own buttons would otherwise have submitted the post.
5. **The lists:**
   - Search fields are labelled, and clear buttons are named.
   - The actions column has a hidden name.
   - The empty state is a level-2 heading. A search that matches nothing says so and offers "Clear search".
   - Row buttons name their row ("Edit “About us”").
   - On a phone, the table's scroll area is a named region in the Tab order, but only while it actually scrolls (`components/admin-scroll-area.tsx`).
6. **Sidebar:** Pages, Blog and URL redirects are in the Online Store group, behind "More". That fixes the tab titles, the sidebar's highlight and the admin search.

### URL redirects (`lib/redirects.ts`, used by `app/api/admin/redirects/route.ts`)

- **The old address is saved as a path:** a full address keeps its path, and anything after `?` or `#` is dropped.
- **Refused:**
  - **Paths the store needs to work, and anything under them:** checkout, the cart, accounts, orders, invoices, tracking, unsubscribe links, the admin and the API.
  - **The store's own pages:** `/shop`, `/collections`, `/blog` and the policies. A redirect from these would hide them. Addresses under them, such as an old collection, post or product, are still allowed.
  - **Circles:** the destination is followed through the other redirects. Editing a redirect leaves itself out of that check.

### The menu editor (`components/navigation-editor-pro.tsx`, `lib/menu-editor.ts`)

- **"When tapped, it opens" has a new choice:** "A page on your store".
  - It lists the store's own pages (home, all products, collections, blog, tracking, stores, wholesale, wishlist, account, cart, the three policies), then its custom pages. Drafts are marked.
  - The item then reads "Page: All products".
- "A web address" is still there, with an example that works ("/about-us or https://…").
- **"Needs attention" points out more links:**
  - a section that isn't there (`/#about`);
  - a `/pages/…` address;
  - a page that is still a draft.
- **The same checks reach the theme editor's publish review and the overview's setup** (`readinessChecks`). Leaf links only; the page check needs the list of pages, so it's in the menu editor only.

### Policies (`components/policies-admin.tsx`)

- **The tabs are a proper tab set:**
  - arrow keys, Home and End move between them, and Enter opens one;
  - the editor is the tabs' panel.
- **The cards say "Edit below"** and bring the tabs and editor into view, with focus on the policy's tab.

### Leftovers

- **The theme editor opens with nothing selected.** A selection that leaves the page is cleared, instead of falling back to the first section.
- **Publishing clears the draft in one step** (`deleteMany`).

## Not changed, on purpose

- **How redirects match.** They are still exact and case-sensitive, as `proxy.ts` looks them up. They still run only against the production database.
- **The store's default menu.** Its "About" link is not changed: stores keep the menu they have. The editor and the publish review now point it out instead.
- **The media picker.** It is used across the admin and is unchanged; the blog places it outside the form.
- **Policies keeps both its cards and its tabs.**
- **On a phone, the tables still scroll sideways** rather than turning into cards.
- **No database changes.** The "redirect the old address" option adds an ordinary redirect row.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass.
  - `tests/admin-online-store-pages.test.ts` adds 11 tests: the redirect rules, tag typing, menu link checks, readiness, and the dialogs, sidebar, Policies and leftovers.
  - Last round's tests and `tests/theme-review.test.ts` pass unchanged.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **axe at 1440, 1280, 900 and 390 px:** the overview, the theme editor, Navigation, Pages, Blog, Policies and URL redirects (28 page loads) show no violations.
  - Every page has its own browser tab title.
  - No page is wider than a phone's screen. One issue was found and fixed along the way: the hidden column name had stretched the page to 669 px.
- **41 browser checks pass on the final build:**
  - **Pages:**
    - Dialog: it is named and focus starts on the title. 14 Tab presses stay inside, and Escape returns focus to "Add page".
    - Refusals: "cart" is flagged before saving, and the refusal shows inside the dialog, uncovered.
    - Live page: a page written in the text editor shows its text on the store.
    - Moving it offers the redirect, ticked. Saving confirms it, and the redirect row exists.
    - An empty search says so.
  - **Blog:**
    - The image picker opens fully on screen. Its buttons don't submit the post, and Escape closes only the picker.
    - A tag typed without Enter is kept, and remove buttons name their tag.
  - **URL redirects:**
    - Created: `/old-shop` → `/shop`, and a full address saved as its path.
    - Refused: a circle, `/shop`, and `/checkout/old`, each with its reason.
  - **Policies:** "Edit below" brings the tabs into view with focus on the policy, ArrowRight moves on, and there is one tab panel.
  - **Theme editor:** no row is highlighted when it opens.
  - **Menu:**
    - "Needs attention" names About's `#about` link.
    - "A page on your store" → "All products" reads "Page: All products", and the warning clears. This was never saved.
  - No page errors.
- **The local store was left as it was.**
  - The test pages, posts, redirects and the lazily created blog row were deleted, along with their audit entries.
  - The theme and menu rows have the same checksums as before.
