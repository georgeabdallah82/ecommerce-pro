# Automatic WhatsApp messages (November 2026)

Branch `claude/whatsapp-messages`, based on `origin/main` at 411a3d7 (after #638). The first growth item from the backend audit.

## What was missing

- Most customers order with a phone number only, so WhatsApp is how they hear about their order.
- Until now, staff had to tap a one-tap button on each order page to send "confirmed" and "on the way", and nothing was sent at delivery.
- A busy day meant customers asking "where is my order?" on WhatsApp.

## What it does

1. **Checkout asks.**
   - "Send my order updates on WhatsApp" appears under the phone number, unticked. WhatsApp's rules require the customer's own yes.
   - It appears only once the store has switched the messages on and set them up.
   - The choice is kept on the order (`Order.whatsappUpdates`, migration `20261120000000_order_whatsapp_updates`). Orders placed before this have no choice, so they get nothing.
2. **The store's WhatsApp number sends three messages** (WhatsApp Cloud API, `lib/whatsapp-cloud.ts`):
   - **Order confirmed:** sent when staff confirm the order. Preparing it later sends nothing more. It gives the total and how it is paid ("cash on delivery" or "paid"), and the link to follow the order.
   - **Out for delivery:** sent when the order ships. It says what to have ready ("$25.00 in cash", or "nothing, it is already paid"), with the same link.
   - **Delivered:** sent when the order is delivered, whichever way: staff, a shipment marked delivered, or a driver's "Delivered". It carries the "rate your order" link.
3. **Each message is sent once per order,** and the order page says how it went:
   - `WhatsApp message "Order confirmed" sent to +96170123456.`
   - `… not sent: the template was not found; check its name and language in Settings (WhatsApp code 132001).` The most likely refusals are in plain words.
   - `… not sent yet: … It will be tried again.` Customers do not see these notes.
4. **Failures:**
   - **When it may pass** (no answer, too many messages, Meta's server error), the message goes on the retry list from #637. It is tried at the top of the hour, for about a day, and the note changes to sent, or to not sent after the last try.
   - **A refusal** (wrong number, template or key) is only noted. A message that WhatsApp accepted is never sent twice. One that got no answer at all can, rarely, arrive twice, because WhatsApp has no "send once" key for these.
5. **Settings › Email & messaging › Automatic WhatsApp messages:**
   - an on/off switch;
   - the phone number ID;
   - the access key: write-only, stored sealed, with a Remove button;
   - the template language;
   - the three template names. An empty name means that message is not sent.
   - The card shows the exact template texts to create.
   - **Send a test** sends one of the three messages, with a sample order, to a number you type. It uses what is saved, so save first.
6. **A fix found on the way:** the Settings save wrote secret values as typed. The Meta Conversions API token stayed readable in the database until the nightly job sealed it.
   - Both saves now seal a secret at once.
   - A screen that sends back the `********` mask can no longer save it over the real value.

## Setting it up (the owner, once)

1. **WhatsApp Manager** (business.facebook.com): use the store's WhatsApp Business account, and add a phone number for the Cloud API.
   - Meta's free test number only messages the five numbers on its list. That is error 131030 in the notes.
   - If the store's number is on the WhatsApp Business app, WhatsApp Manager shows whether it can be used for both.
2. **Message templates › Create template,** three times:
   - category **Utility**;
   - the language chosen in Settings;
   - the names and texts the Settings card shows (also in `lib/whatsapp-templates.ts`).

   **English:**

   ```
   order_confirmed
   Hi {{1}}, your order #{{2}} is confirmed. We are preparing it now.
   Total: {{3}}
   Follow your order: {{4}}
   Thank you!

   order_on_the_way
   Hi {{1}}, your order #{{2}} is on its way! The driver will call you when they arrive.
   To pay on delivery: {{3}}
   Follow your order: {{4}}
   Thank you!

   order_delivered
   Hi {{1}}, your order #{{2}} has been delivered. We hope you love it!
   Tell us how it went: {{3}}
   Thank you for shopping with us.
   ```

   Arabic texts are in the card when the language is Arabic. The values filled in are then Arabic too.
3. **The access key:** Business settings › Users › System users. Add one, give it the WhatsApp account, then Generate token with `whatsapp_business_messaging`. Choose "Never" for when it expires.
4. **In the store:**
   1. Paste the phone number ID and the key, and type the three names. Save.
   2. Send a test to your own WhatsApp.
   3. Switch the messages on and Save.
   4. Checkout shows the choice within a couple of minutes (the store settings are cached briefly).
5. **Cost:** Meta charges per delivered message at its utility rate. A utility message sent while the customer's chat window is open (within 24 hours of their own message) is free. Meta's pricing page has the rate for Lebanon.

## Not changed, on purpose

- **The one-tap WhatsApp buttons stay** on the order page, for customers who did not tick the box.
- **No "order received" message** at checkout: the thank-you page and email already cover it, and staff confirm each order first.
- **One template language for all customers:** orders do not record the shopper's language.
- **Replies are not read by the store:** customers reply on the WhatsApp number as usual.
- **`WHATSAPP_API_URL`** lets local checks point at a stand-in for WhatsApp. Production leaves it unset.

## Verification

- `npm run typecheck`, `npm test` (1345 pass) and `npm run backend:audit` pass. `tests/whatsapp-messages.test.ts` adds 16 tests. They include an answer with no error code (a bare 500 page), changed after the browser checks.
- **The migration** was generated by Prisma (`prisma migrate diff`).
- `npm run build:cloudflare` with the CI environment passes.
- **43 checks pass on the production build,** with the local Postgres database and a stand-in for WhatsApp's Cloud API:
  - **Settings:**
    - the card sets up the messages, and a template name is typed the way WhatsApp makes it;
    - the key is stored sealed at once and shown masked;
    - saving the mask back changes nothing, and the Meta token is sealed on save too;
    - Send test waits for unsaved changes, then sends the confirmed template with sample values and the saved key.
  - **Checkout:**
    - the choice shows, unticked, once switched on;
    - seven orders keep the choice (one unticked);
    - nothing is sent when an order is placed.
  - **Messages:**
    - Confirmed carries the first name, order number, total with "cash on delivery", and the follow link;
    - preparing sends nothing more;
    - Out for delivery says "$104.00 in cash";
    - Delivered carries the review link;
    - three notes on the order.
  - **Who gets nothing:**
    - an order without the choice;
    - after switching off, checkout stops offering it and an order that asked gets nothing more.
  - **Failures:**
    - a refusal (131030) is noted in plain words and not kept;
    - a busy answer (503) is noted as waiting and kept without the key;
    - the hourly job sent it and the note says sent;
    - a sixth failed try gives up and the note says not sent.
  - **Other ways to deliver:** a shipment marked delivered, and a driver's "Delivered", each send Delivered with the store's link.
  - **Notes:** staff see them on the order page; the customer's order page does not show them.
- The card was checked at desktop and phone width (no sideways scrolling).
- **The local store was left as it was** (restored from the dump).
