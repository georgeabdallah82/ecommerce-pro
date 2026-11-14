# Admin › Settings and the pages beside it (November 2026)

Branch `claude/admin-settings`, based on `origin/main` at 016a4cf (after #621).

This round covers the sidebar's Settings group:
- Shipping and Tax;
- Health (System health, Launch checklist, Website status);
- Users & roles and the Activity log;
- Settings itself.

**Surveyed** at 1440, 1280, 900 and 390 px with axe, plus each of Settings' 11 sections with axe and the keyboard.

**Real changes on the local scratch database:**
- saving settings: delivery countries, payment provider details, the Online card switch;
- creating, editing and deleting a shipping zone and a tax rate;
- adding a staff member.

Failed saves were simulated in the browser. The database was saved with `pg_dump` first and restored from it afterwards.

## What was wrong

**Settings lost changes in three ways:**
- **Delivery countries.** The page never read the saved list.
  - With the UAE and France saved besides Lebanon, the card showed Lebanon only.
  - Adding Jordan then saved Lebanon and Jordan, and the UAE and France were gone.
- **Payment provider details** were saved only while Payments was open.
  - A merchant name typed there, then saved from another section, showed "All settings saved" but wasn't saved.
  - Going back to Payments loaded the old value over what was typed.
- **The Online card switch** was written by two saves at the same moment, whichever finished last winning:
  - the settings save, with the switch's value;
  - the payment provider save, with the value it had when Payments was opened.

**Settings didn't know what was unsaved:**
- **Typing that changes no setting counted:** the search box, the Section list on phones, the blocked-number box. The page said "Unsaved changes", showed the bar and warned on leaving, with nothing to save.
- **Changes that weren't typed didn't count:** the switches (they are buttons), taking a country off, choosing a share image.
  - Switching Cash on delivery off left "All changes saved".
  - Leaving the page then lost the change without a warning.
- **Discard asked twice:** its own question, then the browser's leave warning.

**A failed save** said why above the page.
- That is out of view when Save is pressed in the bar after scrolling.
- It was in a neutral box that wasn't read out.

**Smaller things on Settings:**
- **Landmarks:** a second `main` inside the admin's own (three axe rules on every section).
- **The open section** was shown only by its colour.
- **Unnamed boxes:**
  - The blocked-number box had only a placeholder.
  - The feed address box was named "Feed address Copy".
- **Phone keyboards:** email, phone and number boxes brought up the letters keyboard.

**Shipping and Tax:**
- **The New and Edit dialogs weren't dialogs:**
  - Focus stayed on the page. Tab left them: Shipping's New zone 10 times in 10, its Edit zone and Tax's New tax rate 4 in 10.
  - Escape did nothing, and the close button had no name.
- **Errors in the wrong place:**
  - A failed save said why on the page behind the overlay.
  - A shipping rate's inline form said why at the top of the page.
- **Unnamed controls:** the status filters and the search's clear button had no names, and the actions column had an empty header.
- **Rows:** every row's buttons had the same name ("Edit zone", "Delete tax rate").
- **Tax:** its empty state's h3 followed the h1, and on phones its table scrolled sideways but couldn't be reached with the keyboard.

**Users & roles:**
- **Its dialogs** were named, but:
  - Tab left them 2 times in 10, and Escape did nothing.
  - A failed save ("An account with this email already exists") was said on the page behind the overlay.
- **The owner pill:** the accent red on its own tint was 4.3:1.

**Launch checklist:** these were under 4.5:1 at 11–12 px:
- the "ready" count (4.1:1);
- the "need a look" count (3.0:1);
- the "need a look" rows' state (3.6:1).

## What changed

### Settings (`components/settings-center-pro.tsx`)

1. **Delivery countries** are read from the saved list, so the card shows them and adding or removing one keeps the rest.
2. **Unsaved means different from what was saved.**
   - The page keeps a copy of what the server has and compares with it.
   - These count: a switch, a country, a share image, the payment provider details and the Conversions API token.
   - These don't: the search box, the Section list and the cards that save by themselves (blocked numbers, 2-step login, sign-in alerts).
   - Changing something back makes the page saved again.
3. **The payment provider:**
   - It is loaded once, the first time Payments is opened, and saved from any section.
   - Its save owns the Online card switch, `payment.card`. When it runs, the settings save leaves the switch out.
   - The provider save sends the switch's value, with its own checks (an Areeba password before card payments are switched on).
4. **A failed save says why in the bar,** which stays at the top of the screen:
   - it reads "Not saved: …" and is read out;
   - it stays until the next save.
   - "All settings saved" is a status.
5. **Discard** asks once.
6. **Structure:**
   - There is one `main` landmark.
   - The sections are a navigation named "Settings sections", and the open one is marked current.
   - A search that matches no section says so.
7. **Boxes:**
   - The blocked-number and feed address boxes are named.
   - Email and phone boxes use their own keyboards, and number boxes a numeric one.
   - A payment provider that fails to load says so in its card.

### Shared

- **`components/admin-unsaved-bar.tsx`** takes an optional `error`. The other editors that use the bar are unchanged.
- **`components/admin-form-dialog.tsx`** takes an optional `description`, a line under the title that is read with it.

### Shipping and Tax (`components/shipping-admin-pro.tsx`, `components/tax-admin-pro.tsx`)

- **Dialogs:** the New and Edit dialogs use the shared form dialog.
  - Each is modal, named and described, and focus starts in its first field.
  - Tab stays inside. Escape closes it, and focus goes back to the button that opened it.
  - A failed save says why inside it, and it stays open with what was typed.
- **Rate forms:** a shipping rate's inline form says why a save failed in the form.
- **Names:**
  - The filters are named "Show zones" and "Show tax rates", and the search boxes and their clear buttons have names too.
  - The actions column has a hidden "Actions" header.
  - Row buttons are named after their row ("Edit Lebanon"), and a zone's name says whether its details are open.
- **Tables** scroll inside a named region that Tab reaches when they are wider than the screen.
- **The empty states** have an h2, at the size their h3 had.

### Users & roles (`components/users-roles-admin.tsx`)

- **Dialogs:**
  - They follow the same keyboard rules: Tab inside, Escape, focus back to the opener.
  - Their first field is focused without `autoFocus`, which moved focus before the opener was noted.
- **Errors:** a failed save says why inside the dialog. While a dialog is open, the page's own message is hidden.
- **The new-password box** is labelled.
- **The owner pill** uses the accent's darker shade.

### Launch checklist (`components/admin-launch-checklist.module.css`)

- **The counts and the rows' state** use darker green and amber: 6.7:1 and 6.2:1 on their tints, and 6.9:1 on white. They are lighter in dark mode.

## Not changed, on purpose

- **The leave warning** covers reloading and closing the tab, not links inside the admin. Every admin editor is the same, so a warning for admin links is its own change.
- **The setting names under each switch** (`payment.cod` and the rest) stay, because the Activity log names changed settings the same way.
- **System health, Website status and the Activity log** had no findings.
- **Server routes** are unchanged. The payment provider route already checks before card payments are switched on; the page now sends it the switch's value.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-settings.test.ts` adds 8 tests.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **axe at 1440, 1280, 900 and 390 px:**
  - **Before:**
    - Settings: three landmark rules on every section;
    - Shipping: an empty table header and an unnamed select;
    - Tax: the same two, plus heading order and, on phones, a scroll area out of the keyboard's reach;
    - Launch checklist: colour contrast (3 labels);
    - Users & roles: colour contrast (the owner pill).
  - **After:**
    - The 8 pages show no violations and no page errors at all four widths (32 page loads).
    - Every Settings section is clean.
    - The Shipping, Tax and Users & roles dialogs are clean while open.
- **46 browser checks pass on the production build:**
  - **Settings:**
    - one `main`, and each section marked current when open;
    - the search box, the Section list and the blocked-number box leave the page saved;
    - a switch, and taking a country off, make it unsaved; switching back makes it saved;
    - the saved countries are shown, and adding or removing one keeps the rest;
    - a merchant name typed on Payments survives a visit to another section, and saves from it;
    - the Online card switch saves both ways, written once, by the provider save;
    - a failed save says why in the bar, in view;
    - Discard asks once;
    - email and number boxes have the right keyboards.
  - **Shipping, Tax and Users & roles:**
    - each dialog is modal and named, with focus in its first field and no axe findings;
    - 10 Tab presses stay inside;
    - a failed save says why inside, uncovered;
    - Escape returns focus to the opener.
  - **Real saves:**
    - a zone created, edited and deleted;
    - a rate whose save fails says why in its form;
    - a tax rate created and deleted;
    - a staff member added, and a duplicate email refused inside the dialog.
- **The local store was left as it was.** The database was restored from the dump taken before testing.
