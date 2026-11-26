# A WhatsApp setup guide in the admin (November 2026)

Branch `claude/whatsapp-setup-guide`, based on `origin/main` at 2c5b6ff (after #650).

## Why

Automatic WhatsApp messages need the owner to set things up in Meta first: an app, the store's number, a permanent access key and the message templates. Then the details go into the store. Settings only had the fields and a short note, so the steps in Meta had to be found elsewhere.

## What changed

- **A new page, Admin › Settings › WhatsApp setup guide** (`app/admin/settings/whatsapp`, owner only). It walks through five steps:
  1. **Your number on WhatsApp, in Meta.** Create an app with WhatsApp, use the free test number first, add the store's number, and add a payment method. Meta charges per message; the guide links to its prices.
  2. **The phone number ID,** where to find it and where to paste it.
  3. **A permanent access key:** a system user with the app and the WhatsApp account, a key that never expires, the two permissions to tick, and where to paste it.
  4. **The message templates,** with their exact texts:
     - the three order updates (Utility);
     - "Running low?" (Marketing, optional);
     - the sign-in code (Authentication, optional; WhatsApp writes its text).
     - It also shows the Arabic texts for customers who shop in Arabic.
  5. **Switch on and send a test.**
- **Each step ticks itself** from the store's settings (`lib/whatsapp-setup.ts`):
  - the number's ID and the key are saved;
  - the key can still be read;
  - which templates have names;
  - the switch is on;
  - the last "Send a test" went through, or why it failed (from the activity log).
- **The guide never shows the key,** only whether it is saved and readable.
- **At the top, a summary:**
  - how many steps are done;
  - what customers get now: order updates, "Running low?" reminders, "Sign in with WhatsApp";
  - a note that the green chat button on the store pages needs none of this.
- **"If a test fails"** lists WhatsApp's most common refusals in plain words: the same words "Send a test" and the order page use.
- **Links to the guide:**
  - from the WhatsApp card in Settings ("Follow the step-by-step setup guide");
  - from the Launch checklist, as an optional item after launch ("Automatic WhatsApp messages"). It ticks itself once WhatsApp is on and connected, and doesn't count towards being ready to open.
- **Settings can open on a tab:** `/admin/settings?tab=Email` opens Email & messaging. The guide's links use it.

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- **`tests/whatsapp-setup-guide.test.ts` adds 6 tests:**
  - the steps for nothing set, everything set, an unreadable key, a failed test, and switched off;
  - the page: owner only, built from the store's own template texts, never showing the key;
  - the links from Settings and the Launch checklist.
- **`tests/launch-checklist.test.ts`:** its fully set-up store now has WhatsApp on too.
- **In a production build, signed in as the local admin** (password and 2-step code): the guide was opened at desktop and phone width, with nothing set up and half set up.
