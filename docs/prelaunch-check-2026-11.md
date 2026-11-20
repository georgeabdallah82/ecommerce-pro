# Pre-launch check (November 2026)

Branch `claude/prelaunch-check`, based on `origin/main` at 3969762 (after #641). This is item 2 of the three agreed after #641. It checks the live set-up, runs the whole store as shoppers and staff would, and fixes what that finds.

## The live set-up

These were read-only checks on yallahaul.com.

- **Email: sending is authenticated.**
  - DKIM is published (`resend._domainkey`).
  - The `send` subdomain has its own SPF and bounce (MX) records.
  - DMARC is published in monitor mode (`p=none`). That's fine for launch. After a few weeks of mail with no failures, it can be raised to `p=quarantine` (owner, in DNS).
  - Incoming mail goes through Cloudflare Email Routing (MX and SPF on the main domain).
- **Addresses:** `http://` and `www.` redirect permanently (308) to `https://yallahaul.com/`.
- **Security headers** are on every page:
  - HSTS (1 year, subdomains included);
  - a nonce-based Content-Security-Policy;
  - `X-Frame-Options: DENY` and `nosniff`;
  - a strict referrer policy and a permissions policy.
- **Maintenance mode answers 503** with `Retry-After: 3600`, `no-store` and `noindex`. Search engines wait instead of indexing the closed page.
- **Public files answer 200:** `robots.txt`, `sitemap.xml` and the product feed (`/feeds/products.xml`, cached 15 minutes).
- **Tab icons:** the store, the maintenance page and admin declare their icons. Admin also has its app manifest and home-screen icon.
- **Scanner probes** like `/wp-login.php` got the full 404 page, which reads the database. That's fixed on `claude/db-hours` (item 1): requests for files are answered without the database.

## The regression run

This ran on the production build (`next build`, `next start`) against a copy of the store on a local Postgres, in Chromium.

1. **Every page, at both sizes and in both languages: 240 page visits.**
   - 24 storefront pages, in English and Arabic, on a phone (390×844) and a computer (1366×900): 96 visits.
   - 72 admin pages, on a computer and a phone: 144 visits. That's every page in the menu, plus an order, its invoice, a product, a collection and a customer.
   - On each page:
     - the page's status;
     - uncaught errors and console errors;
     - failed requests;
     - sideways scrolling;
     - broken images;
     - in Arabic, that the page runs right to left.
   - **Result: clean.** The only console lines were the expected 404 of the "page not found" test page.
2. **Journeys through the real buttons: 14 checks, all pass.** They passed again on the final build with the fix below.
   - An Arabic shopper on a phone:
     - adds a product to the cart;
     - orders with cash on delivery;
     - sees the thank-you page with the order number;
     - opens the order page, which runs right to left.
   - The order is found again with the lookup (order number and phone), in English on a computer.
   - Staff sign in, with the 2-step code, and find the order. They move it with the order page's own buttons: confirmed, preparing, out for delivery, delivered. As a cash-on-delivery order, it's marked paid on delivery.
   - The customer rates the delivered order.
   - There were no page errors and no server errors along the way.

## What was found and fixed

**An Arabic delivery address came out scrambled on the staff screens.** "شارع البحر 5, جونية, Beirut, Lebanon" showed as "جونية ,5 شارع البحر, Beirut, Lebanon": the city came before the street, and the number sat on the wrong side.

- **Why:** the parts were joined into one line of text. The browser laid out the Arabic street, its number, the comma and the Arabic city together, right to left.
- **Where it showed:**
  - the admin order page ("Deliver to");
  - the delivery sheet (`/admin/orders/deliveries`);
  - the driver's page (`/driver/<link>`), where a driver reads where to go.
- **The fix:**
  - `components/address-parts.tsx` puts each part in its own `<bdi>`. Each part keeps its own direction, and commas join the parts.
  - On screen, the city and the region are separate parts (`addressParts` in `lib/order-flow.ts`). An Arabic city next to an English region now stays in its place too.
  - On the rebuilt app, "Deliver to" reads "شارع البحر 5, جونية, Beirut, Lebanon", in order.

Not changed:

- **Packing slips and invoices** already put each address line on its own line, in its own direction (`dir="auto"` and `<bdi>`).
- **Plain text is left as it is:** the message sent to a driver over WhatsApp, the delivery sheet's download and "Copy address". The app that shows the text lays it out.

## Verification

- `npm run typecheck`, `npm test` (1368 pass) and `npm run backend:audit` pass. `npm run build:cloudflare` passes too.
- `tests/address-parts.test.ts` adds 3 tests:
  - each part is shown in its own direction;
  - on screen, the city and the region are separate parts, while printed and copied addresses keep "city, region" together;
  - the admin order page, the delivery sheet and the driver page all use the parts.
