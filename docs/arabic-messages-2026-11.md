# Customer emails and WhatsApp messages in Arabic (November 2026)

Branch `claude/arabic-messages`, based on `origin/main` at e3ad84f (after #646).

## Why

- **The storefront could already be shown in Arabic** (Theme settings › Languages).
- **But every email and WhatsApp message stayed English:** a customer who shopped in Arabic got their order confirmation, cart reminder or password reset in English.

## What changed

- **The store keeps the language the shopper used** (`lib/message-lang.ts`):
  - **The order:** at checkout (`Order.lang`).
  - **A cart left at checkout:** `AbandonedCheckout.lang`, saved each time the checkout form is saved.
  - **A "notify me when it's back" request:** `BackInStockRequest.lang`.
  - **Which language that is:** the language the shopper's pages are shown in, by the same rules as the pages. Arabic counts only once the owner switched the Arabic store on, or in the owner's Arabic preview.
  - **Records from before,** and orders, invoices and gift cards that staff make, have no language of their own. They use the customer's latest order that has one, else the store's default. The default is Arabic only when the Arabic store is on and set as the default.
- **Customer emails are written in that language** (`lib/email.ts`).
  - **Which emails:** all 13 sent to customers.
    - order: confirmation, shipped, order edited, return updates, gift card ready, review request;
    - other store emails: invoice, gift card received, cart reminder, back in stock;
    - account: password reset, confirm your email, "you already have an account".
  - **Account emails** go out at once, in the language of the page they were asked from.
  - **Arabic emails read right to left,** with the amounts on the left.
  - **What stays as typed:** product names, staff notes and addresses.
  - **Staff emails stay English:** the morning summary, weekly report and alerts.
- **The Arabic texts are in `lib/i18n-ar.ts`,** with the storefront's.
  - 88 new texts, a first translation for the owner to review.
  - `tests/i18n.test.ts` already fails on any text without its Arabic, so a new email text can't be left in English by mistake.
- **The "back in stock" phone notification** is in the shopper's language too.
- **WhatsApp messages can go in Arabic** (`lib/whatsapp-cloud.ts`).
  - **A new switch:** Settings › Email & messaging › Automatic WhatsApp messages › "My templates also have an Arabic version".
  - **With it on:** customers who shop in Arabic get the Arabic version of each template, with Arabic words filled in.
  - **No Arabic version yet:** if WhatsApp has no Arabic version of a template (error 132001), that message goes in the main language instead, and the order page says so.
  - **The card:**
    - shows each template's Arabic text to paste into WhatsApp Manager;
    - "Send a test" can send the Arabic version, to check it exists before customers get it.
  - **Templates made in Arabic** (main language Arabic) were already Arabic for everyone; the switch isn't shown for them.
- **Database:** one migration adds an empty `lang` column to Order, AbandonedCheckout and BackInStockRequest (`20261122000000_message_language`). Nothing else changes for existing rows.

## What the owner does

- Nothing for emails: they follow the shopper once the Arabic store is on.
- **For WhatsApp in Arabic:**
  1. In WhatsApp Manager, open each of the three templates and add the language Arabic, with the Arabic text shown in Settings.
  2. Turn on "My templates also have an Arabic version".
  3. Send an Arabic test.
- **Review the Arabic wording** in a few real emails before launch, like the storefront's.

## Verification

- `npm run typecheck`, `npm test` (1410 tests), `npm run backend:audit` and `npm run build:cloudflare` pass.
  - The Worker bundle is still Latin-1 only: the Arabic stays in ordinary strings.
- **`tests/arabic-messages.test.ts` adds 14 tests:**
  - which language a message goes in, and the store default;
  - Arabic emails read right to left with Arabic subjects, and English ones are unchanged;
  - a cart left in Arabic is reminded in Arabic with the amounts on the left;
  - all 13 customer emails take the language, and the 4 staff emails don't;
  - the language is kept at checkout, in the cart and in "notify me";
  - WhatsApp picks the Arabic version, falls back on 132001 only, and retries the same way.
- **`tests/retry-outbox.test.ts`:** the "password resets are never retried" check now reads the translated subject.
- **In the Cloudflare runtime** (`wrangler dev`, PostgreSQL, Arabic store on, a stand-in WhatsApp server):
  - **An order placed from an Arabic page:** `lang = ar`. Its confirmation subject was "تم تأكيد طلبك — رقم 1004".
  - **The same order from an English page:** `lang = en`, "Order confirmed — #1005".
  - **Carts:** a cart saved from an Arabic page kept `ar`; one from an English page kept `en`.
  - **Password reset:** asked from an Arabic page, its subject was "أعد تعيين كلمة المرور".
  - **WhatsApp, against PostgreSQL and the stand-in:**
    - the Arabic order's "Order confirmed" went in Arabic (`ar`, "عزيزي العميل"-style words);
    - its "Out for delivery", whose Arabic version the stand-in did not have, went in English, and the order page says why;
    - the English order's messages went in English.
  - **Both confirmation emails were rendered and checked by eye.** Arabic reads right to left, with the amounts on the left; English is laid out as before.
