# Store links: collection pages, the customer's invoice, paying an invoice, email preferences (November 2026)

Branch `claude/store-links`, based on `origin/main` at 04c5726 (after #613). A survey of the storefront pages no earlier round covered:
- Already looked finished, unchanged: the "Rate your order" page, order lookup and the 404 page.
- Changed: the collection pages, and the pages a customer reaches from a link the store sends: the invoice, paying an invoice, email preferences and an expired courier link.

New styles are in `app/storefront-links.css`, imported last.

## What changed

1. **Collection pages (`/collections` and each collection).**
   - The sort menu had no name for screen readers (axe: select-name). It is "Sort products", as on the shop page.
   - The small label above the title ("COLLECTION", "CURATED SHOPPING") was 11 px grey on a cream pill: 4.0:1, under the 4.5:1 minimum. It is plain 13 px text in the store's darker grey, like the cart's and the wishlist's labels. Over a collection photo it stays light.
   - "5 products" showed twice, under the title and above the grid. It now shows once, above the grid.
   - The product names (h3) came straight after the page title (h1) (axe: heading-order). A "Products" heading for screen readers fills the gap.
2. **The customer's invoice (`/invoice/…`, the link staff send from Admin).**
   - On the Arabic store it was all English, left to right, and the hint's full stop landed on the wrong side. The customer's copy is now in the store's language:
     - "Print / Save PDF", the hint, and the invoice's labels (Bill to, Deliver to, Item, Qty, Price, Total, Payment and the rest).
     - The order's state in the words of the customer's own order pages: "Pending", where the admin says "New".
     - The payment line and what is still due ("Pay on delivery").
     - In Arabic it reads right to left. Amounts, phone numbers and emails stay left to right; names and addresses keep their own direction.
     - The store's own texts (title, notes, thank-you line) are shown as typed. While they are still the defaults ("Invoice", "Thank you for shopping with us!"), they are translated.
     - The PDF the customer saves is the same copy.
   - The admin's copy reads as before: English, left to right, the admin's words.
   - **A bug:** on a phone, and on paper, the customer's items table shrank to its content. Below 900 px the store turns tables into scroll boxes, and an A4 page is narrower than that. The table fills the width again. The admin's copy was not affected.
   - Three readability fixes:
     - The amount still due was the store's red on its own tint (4.3:1). It is now dark text with a bar in the store's colour, so it passes whatever colour the store picks.
     - The hint was 4.46:1. It now uses the store's muted grey.
     - The small labels were 10.5 px on screen. They are 12 px on screen and keep 10.5 px on paper.
3. **Paying an invoice (`/pay-invoice/…`).**
   - It uses the order confirmation's cards:
     - The items.
     - Then the subtotal, delivery, discount and tax, when the total differs from the items.
     - Then the total due.
     - Item names keep their direction, and prices read left to right in Arabic.
   - With a card gateway, "Pay now" is the store's full-width button.
   - Paid, cancelled, or completed without a payment: a card with an icon says so, with "Continue shopping".
   - **A bug:** the page said "This invoice has already been paid" for every completed invoice.
     - The pay route says that only when the order is actually paid. Otherwise it says the invoice can't be paid online and asks the shopper to contact the store.
     - The page now makes the same check, using one list of paid states shared with the route.
   - The ways to reach the store are underlined links. With no phone or email saved, the sentence ends with a full stop instead of a colon.
4. **Email preferences (`/unsubscribe`, from cart reminder emails).**
   - The old empty box is now the message card of the store's other link pages.
   - Each state (asking, done, link not valid) has its own icon, its sentence and full-width buttons.
   - It still asks before unsubscribing, so email link scanners can't unsubscribe anyone.
5. **An expired courier link (`/driver/…`).** "This link no longer works" was English only, in the system font, and in Arabic its full stop landed on the wrong side. It is now translated and shown in the store's card and font.
6. **Found while checking with the store's phone number set.** The local store had no phone number, so earlier checks never showed these:
   - The "Need help with your order? WhatsApp us" band above the footer sat outside every landmark, on every page (axe: region). It is now a labelled region.
   - Its "WhatsApp us" link was 34 px tall on a phone. It is now 44 px on touch screens.
   - The product page's "Order on WhatsApp" text was 4.3:1 on white. A darker green brings it to 5.0:1.

## Not changed, on purpose

- **The courier's own delivery list** is still English only. It is a staff tool, so translating it is a separate decision.
- **Remembering a collection's sort in the link**, as the shop page does. It was offered as an option and not asked for.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `npm test` runs 1182 tests; `tests/store-links.test.ts` adds 8. They include the invoice's words in both languages, and that the customer's payment line matches the admin's in every state.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- Browser checks at 1280 and 390 px and in Arabic. They used a local test invoice, the store's phone and email, and a photo on one collection, all removed afterwards; the order's status was put back.
  - On the changed pages:
    - No axe violations.
    - No phone tap target under 44 px.
    - No text under 12 px.
    - No sideways scroll.
    - One heading per page.
  - Collections: the sort menu has its name, the count shows once, and the label is 13 px dark grey (light over a photo).
  - The customer's invoice:
    - It reads in Arabic, right to left.
    - It prints alone, with 10.5 px labels.
    - Its table fills the width on a phone.
  - Paying an invoice:
    - The summary shows correctly.
    - With a card gateway, "Pay now" is full width. It was not clicked, because that would create an order.
    - The bank transfer details show.
    - The paid, cancelled and completed-but-unpaid cards show.
  - Email preferences: the form button matches the link beside it and still posts.
  - The expired courier link shows in Arabic, in the store's font.
- The admin's invoice copy is covered by the unit tests. Signing in to the local admin needs its authenticator code.
- UX audit of 9 pages at both widths, with the store's phone number set:
  - No axe violations.
  - No phone tap target under 44 px.
  - No text under 12 px.
  - No sideways scroll.
- Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
- The checks from earlier rounds still pass: the homepage motion checks (37), and the sticky header, focus and scroll-lock checks (10).
