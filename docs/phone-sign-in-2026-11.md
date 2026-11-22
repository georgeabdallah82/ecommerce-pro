# Sign in with a WhatsApp code (November 2026)

Branch `claude/phone-sign-in`, built on `claude/reorder-reminders` (itself on `claude/arabic-messages`). The code is sent in the customer's language.

## Why

Most customers order with a phone number and no email, so they never had an account: no order history, no wishlist, no faster checkout. Now they can sign in with the number they already order with.

## What changed

- **"Sign in with WhatsApp" on the sign-in page** (`components/phone-sign-in.tsx`):
  1. The customer types their mobile number.
  2. A 6-digit code arrives on WhatsApp, with a "Copy code" button.
  3. They type the code and are signed in.
  - The page is in their language, and the number reads correctly in Arabic.
  - It is offered only once the store has set up the code's template (below).
- **Customers only** (`lib/phone-sign-in.ts`).
  - A staff account is never signed in by a code: staff sign in with their password and their 2-step code, which this can't get around.
  - This also holds if a customer account made this way is later turned into staff.
- **Which account:**
  - **The number's own account:** the one an earlier code sign-in made for it.
  - **Otherwise a new one:**
    - its name comes from the customer's latest order with that number;
    - it has a placeholder address at `phone.invalid`, since accounts need one;
    - it has no usable password.
  - **No email to the placeholder:** nothing is ever emailed to it (`lib/email.ts`), and the store's session answer doesn't show it.
  - **Never an account that only has the number typed in its profile:** nobody checked that number, and someone could type another person's number into their own profile to get that person's orders.
- **Past orders join the account:** orders placed as a guest with that number, whether as the order's phone or the delivery address's.
  - Numbers are compared by their digits, so "70 123 456", "+961 70-123-456" and "70123456" all match.
- **Codes:**
  - kept only as a keyed hash;
  - valid 10 minutes and 5 tries, after which a new one is needed;
  - used once, and only the latest works.
- **Limits**, so nobody can guess codes or run up the store's WhatsApp bill:
  - per number: 3 codes in 15 minutes and 10 a day;
  - per internet address: 10 codes an hour and 30 checks an hour;
  - for the whole store: 300 codes a day;
  - lockout: 10 wrong codes in an hour lock the number for that hour.
- **Settings › Email & messaging › Automatic WhatsApp messages:**
  - a "Sign-in code" template name;
  - how to create it (category Authentication, "Copy code");
  - "Send a test" can send a sample code (123456).
- **The WhatsApp sender** (`lib/whatsapp-cloud.ts`) can fill an Authentication template's "Copy code" button; the other messages are unchanged.
- **Database:** one migration adds `PhoneLoginCode`, the codes sent, as hashes (`20261122200000_phone_sign_in`).

## What the owner does

1. In WhatsApp Manager › Message templates, create an **Authentication** template:
   - name `login_code`;
   - "Copy code" button;
   - the security note ticked, and the code set to expire in 10 minutes;
   - Arabic too, if "My templates also have an Arabic version" is on.
2. Type its name in Settings, save, and "Send a test" with "Sign-in code".
3. "Sign in with WhatsApp" then shows on the sign-in page.

## Verification

- `npm run typecheck`, `npm test` (1428 tests), `npm run backend:audit` and `npm run build:cloudflare` pass.
  - The Worker bundle is still Latin-1 only.
- **`tests/phone-sign-in.test.ts` adds 8 tests:**
  - codes: six digits, keyed hashes, tied to their number;
  - the "Copy code" button, with the Arabic version and its fallback, and no button on other messages;
  - placeholder addresses never get email, and are hidden from the session answer;
  - customers only, with the session set only after a right code;
  - accounts never matched by a typed profile phone;
  - the limits and the lockout;
  - not offered without the template, and bad input refused;
  - Settings.
- **`tests/manual-order.test.ts`:** the "nothing is emailed to an empty address" check now reads the extended rule.
- **In the Cloudflare runtime** (`wrangler dev`, PostgreSQL, a stand-in WhatsApp server):
  - **Sending:** a code went to a number on WhatsApp, in Arabic, with the `login_code` template.
  - **A wrong code:** refused.
  - **The right code:** signed in. The number was typed differently ("+961 76-557-123"), and the session answer had no email.
  - **The new account:** named "سارة حداد" from the guest order placed with that number ("76 5571 23"). That order joined the account; an order with another number didn't.
  - **The code used again:** refused.
  - **A second sign-in:** same account, no duplicate.
  - **A fourth code in 15 minutes:** refused. The per-address hourly limit also showed up during testing.
  - **10 wrong codes in an hour:** both sending and checking refused, "try again in an hour".
  - **An account made staff, then a right code:** refused (403), no session.
  - **In a browser, on the Arabic sign-in page:** "Sign in with WhatsApp", the number, the code from WhatsApp, then signed in and on the account page.
