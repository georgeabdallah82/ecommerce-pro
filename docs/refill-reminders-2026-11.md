# "Running low?" reminders (November 2026)

Branch `claude/reorder-reminders`, built on `claude/arabic-messages` (the reminders are written in the customer's language).

## Why

The store sells things people buy again and again: detergent, toiletries, coffee. A customer who runs out may buy it at the nearest shop instead. A short reminder at the right time, with a link that puts the same product back in their cart, brings that order back to the store.

## What changed

- **Each product can say when its buyers may need it again.**
  - Where: product editor › Inventory › "“Running low?” reminder after (days)", e.g. 30 for detergent.
  - Empty means no reminder, which is how every product starts. Allowed values are 7 to 365 days.
- **The morning job sends the reminders** (`lib/refill-reminders.ts`, run from `app/api/internal/daily` after the review emails).
  - **When:** that many days after the order was delivered.
  - **Which language:** the customer's own (`lib/message-lang.ts`).
  - **On WhatsApp** when the customer ticked "Send my order updates on WhatsApp" and the store has a "Running low?" template. **Otherwise by email.**
- **The link opens a small page** (`app/refill/[orderNumber]`).
  - It lists the products at today's prices, with what is in stock, and an "Add to cart" button: one tap and they are in the cart.
  - The link is signed for that order only. It shows nothing else about the order.
- **"Stop these reminders":**
  - on that page, which asks first (mail scanners open links);
  - from the mail app's own Unsubscribe button (one-click, `app/api/refill/stop`).
  - It stops reminders to both the customer's email address and their phone number, and it keeps working while the store is in maintenance.
- **Limits:**
  - one reminder per product per order, never sent twice, even by two runs at once;
  - at most one a week per customer;
  - none for a product the customer has ordered again since;
  - none after they asked to stop, or unsubscribed from the store's reminder emails;
  - none for a product that can't be bought today (sold out or unpublished): it is tried again on a later morning while still due;
  - none more than 14 days late. Turning reminders on doesn't send a burst for old orders;
  - 30 a morning.
- **On the order page,** a note says what happened, e.g. "Running low? reminder sent by WhatsApp: Persil Gel."
- **Settings › Email & messaging:**
  - **"“Running low?” reminders"** turns them all off. It is on by default, but nothing is sent until a product has days set.
  - **The optional "Running low?" WhatsApp template:** its name, its text (and its Arabic version) to create in WhatsApp Manager. Category Marketing, because it isn't about an order in progress.
- **Database:** one migration (`20261122100000_refill_reminders`):
  - `Product.refillDays`;
  - `RefillReminder`, one row per reminder, with how it went;
  - `RefillOptOut`, the customers who asked to stop.
- **The new address `/refill` is protected:**
  - a custom page can't take it (`lib/reserved-handles.ts`);
  - a redirect can't send it elsewhere (`lib/redirects.ts`).

## What the owner does

1. Set the days on the products people rebuy: product › Inventory.
2. **Optional, for WhatsApp:** in WhatsApp Manager, create the "Running low?" template (category Marketing) with the text shown in Settings, and type its name there. Without it, reminders go by email.

## Found while testing

- **The bug:** a reminder counted the days from the order's *latest* "Delivered" entry. The reminder's own note was saved as "Delivered" too, so the next run thought the order had just arrived.
- **The fix:**
  - the days now count from the *first* time the order was delivered;
  - the notes are saved as "Note", so they can't move that day. They also can't make the review emails think the order just arrived.
- A test keeps both.

## Verification

- `npm run typecheck`, `npm test` (1420 tests), `npm run backend:audit` and `npm run build:cloudflare` pass.
  - The Worker bundle is still Latin-1 only.
- **`tests/refill-reminders.test.ts` adds 10 tests:**
  - the days box;
  - the due window, never late;
  - who the customer is;
  - the signed link and the stop route, which also works during maintenance;
  - the email in both languages, with the mail app's unsubscribe and no retry queue;
  - the WhatsApp values and the Arabic version;
  - where it is set up;
  - the limits, including the bug above.
- **Two existing guards caught the new address and were updated:** the reserved page addresses, and the addresses never redirected.
- **Against PostgreSQL**, with a product set to 30 days, orders delivered 31 days earlier and a stand-in WhatsApp server:
  - **Arabic WhatsApp customer:** reminded in Arabic ("سارة", the product, the signed link).
  - **English email customer:** reminded by email, with a one-click unsubscribe header.
  - **Re-ordered since:** skipped.
  - **Asked to stop:** skipped, with a note on the order.
  - **Delivered 60 days earlier:** too late, nothing sent.
  - **A second run:** sent nothing.
- **In the Cloudflare runtime** (`wrangler dev`):
  - the page in Arabic and English;
  - a bad link;
  - ask-first, stop from the page, and the mail app's one-click stop (both the email address and the phone number recorded);
  - in a browser, "Add to cart" put the product in the cart and opened it;
  - the real morning job (`/api/internal/daily`) sent the reminder and reported it.
