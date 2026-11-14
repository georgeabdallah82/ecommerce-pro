# Store › WhatsApp buttons you can read (November 2026)

Branch `claude/store-whatsapp-contrast`, based on `origin/main` at 5da85b4 (after #623).

The admin's WhatsApp buttons were darkened in the Orders round (`docs/admin-orders-2026-11.md`). These are the customer-facing ones.

## What was wrong

**Three store buttons had white on WhatsApp's own green, `#25d366`, which is 2:1** (text needs 4.5:1, an icon 3:1):
- **The floating WhatsApp button:** its logo, and its label when the owner sets one ("Chat with us").
- **"Send my order on WhatsApp"** on the order confirmation page. Its hover green, `#1fa855`, was 3.1:1.
- **"Share on WhatsApp"** on the invite-a-friend card.

## What changed

**All three use `#15803d`, with `#166534` on hover:**
- White on `#15803d` is 5.0:1; on `#166534` it is 7.1:1.
- This is the shade the admin's WhatsApp buttons use, and the product page's "Order on WhatsApp" text (`app/storefront-links.css`).
- **The files:**
  - `app/storefront-market.css`: the floating button;
  - `app/order/success/success.module.css`: "Send my order on WhatsApp";
  - `app/storefront-selling.css`: the invite's Share.

## Not changed, on purpose

- **The light green tint and border** around the confirmation page's WhatsApp box stay. They carry no text.
- **"Order on WhatsApp" on a product page** has a white button with a green border. Its text was darkened in an earlier round.

## Verification

- `npm test` passes. `tests/store-whatsapp-contrast.test.ts` adds 2 tests: no store stylesheet fills a button with `#25d366` or `#1fa855`, and the three buttons use the new green.
- `npm run build:cloudflare` with the CI environment passes.
- **9 browser checks pass on the production build.** The store's phone number, its floating button and invite a friend were set up on the local scratch database, then restored.
  - **The floating button:** its logo is 5.02:1 on desktop and on a phone (it was 1.98:1). With a label, axe finds no contrast problem.
  - **The order confirmation page:**
    - It shows both buttons, each 5.02:1.
    - "Send my order on WhatsApp" is 7.13:1 on hover (it was 3.09:1).
    - axe finds no contrast problem on the page, and there are no page errors.
- **The "before" pictures** show the same build with the old green put back by an injected stylesheet, the only difference.
