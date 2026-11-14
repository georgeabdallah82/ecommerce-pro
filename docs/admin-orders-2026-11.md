# Admin › Orders: the order list and the order page (November 2026)

Branch `claude/admin-orders`, based on `origin/main` at 04f5696 (after #620).

The November admin audit (`docs/admin-audit-2026-11.md`) covered the orders area's security. This round covers how the pages work for the people using them every day.

**Surveyed** at 1440, 1280, 900 and 390 px, with axe and the keyboard:
- the order list;
- two order pages;
- the invoice and packing slips;
- the create-order page.

**Real changes on the local scratch database:**
- confirming an order;
- WhatsApp answers;
- notes;
- tracking numbers;
- a refund, with the password check.

The database was saved with `pg_dump` first and restored from it afterwards.

## What was wrong

**The order list:**
- **The "More" menus couldn't be used from the keyboard.** Opening one left focus on the button, and the arrow keys did nothing. The header menu's links weren't menu items.
- **The refund and tracking dialog:**
  - It wasn't modal: Tab left it 7 times in 10 presses, and Escape did nothing.
  - Its errors showed on the page behind the dark overlay. A refund over the limit ("Refund must be between 0.01 and $0.00") looked like nothing happened.
  - The tracking dialog closed even when the save failed.
  - Refund was offered on an order with nothing paid to give back ($0.00).
- **The password check before a refund** (`components/admin-reauth.tsx`) had no keyboard handling either: Tab walked out of it.
- **The header's "More" button** was named "More order pages", while showing "More" and a count. axe flags the mismatch.

**The order page:**
- **Landmarks:** a second `main` inside the admin's own (three axe landmark rules).
- **The notes box** had only a placeholder for a label.
- **Panels:** the tracking and "Fix status by hand" panels closed even when the save failed.
- **The contact and address form** had Save and Cancel only at the top, more than 1,300 px above its last fields.
- **Payment screenshots** showed their time in the browser's own format and time zone, not the store's.
- **The live-tracking box** said "Tracking becomes available when the order is PROCESSING or SHIPPED.": status codes, not the page's own step names.

**Every order page:**
- **The browser tab read "Orders · Admin",** so several orders open in tabs couldn't be told apart.
- **Contrast:**
  - White on WhatsApp green (`#25d366`) is 2:1. The list, the invoice and other admin and courier pages use it.
  - The order page's own WhatsApp green was 4.1:1.
  - The list's blue "Confirmed" label and the order page's accent label are under 4.5:1.

**The create-order page threw a React hydration error (#418) on every load.**
- **Cause:** its country list is built from the engine's own country names (`Intl.DisplayNames`), and Node and Chrome name four countries differently:

  | Code | Node | Chrome |
  |---|---|---|
  | HK | Hong Kong SAR China | Hong Kong |
  | MO | Macao SAR China | Macao |
  | PS | Palestinian Territories | Palestine |
  | FK | Falkland Islands | Falkland Islands (Islas Malvinas) |

- **Effect:** the list rendered on the server didn't match the browser's, so React threw the page's HTML away and rendered it again.
- **Elsewhere:** the same list is on checkout and account addresses.
- **Settings had the same error from its currency list:** Node knows SLE, XCG and ZWG, and Chrome didn't.

## What changed

### Shared

1. **`components/admin-menu.tsx`:** a menu button with a menu, now used by both pages' "More" menus.
   - Opening it (click, Enter, Space or ArrowDown) moves focus to the first item.
   - ArrowDown and ArrowUp move through the items and wrap round. Home and End jump to the first and last.
   - Escape closes it and returns focus to the button, and Tab closes it.
   - Choosing an item puts focus on the button, so a dialog the item opens returns focus there.
2. **`components/use-modal-focus.ts`:** keys inside a dialog opened on top (the password check, a confirmation) are left to that dialog.
3. **The password check** uses the same rules: Tab stays in it, Escape cancels, and focus returns to the button that needed it.
4. **Fixed lists:**
   - English country names come from one fixed table in `lib/delivery-countries.ts`, the same on the server and in every browser. It is generated from Node's names, with the short form for the four that differ: Hong Kong, Macao, Palestine and Falkland Islands.
   - The names engines give still read back as their country, so older saved addresses keep matching. Arabic names still come from the engine.
   - The currency list in `components/field-selects.tsx` is a fixed list too.
5. **Tab titles:** a page can name its browser tab with `data-admin-title` (`components/admin-nav.tsx`). The order page uses it ("Order #1001 · Admin"), and so does the invoice ("Invoice #1001 · Admin").
6. **WhatsApp buttons** use `#15803d` (5:1), with `#166534` on hover. That covers:
   - the list, the order page and the invoice;
   - the delivery sheet, unfinished checkouts, suppliers and the courier's run;
   - Win back and the pages that share its styles: Drivers, What to reorder, Questions, Influencers, Invite a friend and Rewards.

### The order list (`components/orders-admin-shopify.tsx`)

- **The refund and tracking dialog:**
  - It is modal, named by its heading, and focus starts in its first field.
  - Errors show inside it, and it stays open when a save fails, keeping what was typed.
  - Escape closes it, and focus returns to that order's "More" button.
- **Refund** is offered only when something paid is left to give back.
- **The header menu's count** sits on the button's corner, outside its name, which now says what the count means ("More order pages, 3 unfinished checkouts to follow up").
- **The empty state** is a level-2 heading.
- **The blue label** is a shade darker, with a lighter blue in dark mode.

### The order page (`components/order-detail-admin.tsx`)

- **Structure:** one `main` landmark; the notes box and the staff note are labelled.
- **Panels:** the tracking and "Fix status by hand" panels close only when the save worked. Otherwise they stay open with what was typed, and the reason shows above them.
- **The contact and address form** has Save and Cancel after its last field too.
- **Times and wording:**
  - Payment screenshots show their time in the store's time zone.
  - Live tracking reads "Live tracking can start once the order is Preparing or Out for delivery."
- **The accent label** uses the darker accent shade.
- **Tracking fields** stop at 120 characters, the length the server keeps.

## Not changed, on purpose

- **The time zone list:** it is still the engine's own. Node's and Chrome's match today.
- **Settings:**
  - Its own second `main` is left for a Settings round.
  - The currency fix only removes the hydration error, which came from a shared component.
- **Refunds on the server** are unchanged. In the browser checks, a refund on a test order whose total was raised by hand was refused by the server ("Unable to process the refund right now"). It has no matching payment on record. The point checked was that the reason now shows inside the dialog.
- **The invoice's second "Invoice" heading** is the hidden print copy, so it stays.
- **The storefront's WhatsApp buttons** (the floating button, the order-confirmation page, invites) still have white text on WhatsApp's own green. They face customers and belong to a storefront round.
- **Order flows and wording** are otherwise as they were.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-orders.test.ts` adds 6 tests.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check. The one non-Latin-1 country name is written as an escape.
- **axe at 1440, 1280, 900 and 390 px:**
  - **Before:**
    - the list had 2 kinds of issue (contrast, a name mismatch);
    - each order page had 4 (contrast and three landmark rules);
    - the invoice had 1 (contrast);
    - the create-order page threw the hydration error.
  - **After:** the list, both order pages, the invoice, packing slips, create order, the delivery sheet and unfinished checkouts (32 page loads) show no violations and no page errors.
  - Create order and Settings load without errors at all four widths.
- **28 browser checks pass on the final build:**
  - **List menus:**
    - Opening the header menu moves focus to its first item.
    - ArrowDown moves on and wraps round, and Escape returns focus to the button.
    - The button's name gives the count.
    - An order with nothing paid offers no Refund.
  - **The tracking dialog:**
    - It is named and has focus, and 10 Tab presses stay inside.
    - A failed save (simulated) keeps it open, with the reason and what was typed.
    - Escape returns focus to that order's "More".
  - **Refund:**
    - Too large an amount says so inside the dialog, uncovered.
    - The password check opens on top with focus, and Tab stays in it.
    - The server's answer shows in the dialog.
  - **The order page:**
    - The tab title is "Order #1001 · Admin", and there is one `main` landmark.
    - The notes box is labelled.
    - Its menu moves focus in, and End goes to "Cancel order".
    - A failed tracking save (simulated) leaves the panel open with what was typed and why.
    - Save appears after the form's last field, and a note is added.
    - Live tracking uses the page's words.
  - **The invoice:** the tab title is "Invoice #1001 · Admin".
  - **Create order:** it loads without a page error.
- **The local store was left as it was.** The database was restored from the dump taken before testing: the three orders as they were, no notes, and 25 audit entries.
