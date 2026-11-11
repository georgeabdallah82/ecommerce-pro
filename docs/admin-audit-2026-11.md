# Admin audit, November 2026

Scope: the admin panel (`app/admin/**`, 79 pages), its API (`app/api/admin/**`, 113 routes), the admin layout and the shared admin components.

Method: a script over every admin route (guard, permission per HTTP method, audit call, error replies, list queries without a limit, user rows in responses); reading each route the script flagged; and a before-and-after measurement of the leaks against the local database over HTTP. The backlog was then worked through, and each item was checked in the code and, where it can be, in a browser.

## Summary

- Highest risk found: staff browsers received password hashes and two-step fields. Fixed.
- Parcel tracking links accepted `javascript:` addresses that the admin renders as links. Fixed.
- Customer accounts could load the admin shell. Fixed.
- Two dead components removed. A storefront test was still reading one of them; it now checks the live homepage.
- All seven backlog items are done. Two decisions were recorded: `roles` is capped at 30 custom roles, and two-step login stays required for every staff account rather than becoming a store setting.

## Fixed in this branch

| ID | Severity | Finding | Evidence | Fix | Measured |
|---|---|---|---|---|---|
| F1 | High | Staff browsers received password hashes and two-step fields | Order page HTML held a staff bcrypt hash and the `totpSecret` and `totpBackupCodes` keys. The order-note response held a hash. | `lib/user-public.ts` (`publicUserSelect`) on the orders API (list and notes), the orders page, the dashboard and the order page. The staff list uses the same select. | Hashes on the order page: 1 → 0. Hash in the note response: 1 → 0. |
| F2 | High | Parcel and order tracking links accepted any text, including `javascript:` addresses, and the admin page renders them as links | `app/api/admin/fulfillments/[id]` and `app/api/admin/orders` stored the raw value. `components/order-detail-admin.tsx` rendered it as `href`. | `lib/safe-url.ts` (`safeHttpUrl`). Both routes reply 400 for anything that is not http or https, and the page shows a link only when it is valid. | `javascript:` → 400 on both routes. An `https` link → 200. |
| F3 | Medium | A customer account could load the admin shell. The layout only checked for a signed-in user; pages guard their own data, so no data was exposed. | `app/admin/layout.tsx` | Customer accounts are sent to sign-in. The team-notice board is only rendered after that check. | Checked in a browser on the production build: a customer session ends at the admin sign-in, and the admin menu does not appear. |
| F4 | Low | Removing a number from the WhatsApp list deleted it on one click | `components/whatsapp-list.tsx` | Confirm dialog first | Checked in a browser: Remove asks first; Cancel keeps the number; Remove deletes it. |

Latent, now closed by F1: the orders API, the orders page and the dashboard included full customer rows for orders placed from an account. Those rows carry the customer's password hash.

## Removed

- `components/admin-sales-chart.tsx`: no imports.
- `components/aliexpress-home.tsx`: no imports; the storefront doesn't render it. A storefront accessibility test still read it. That test now checks the live homepage (`app/page.tsx`) and the product page.
- `components/admin-orders-list.module.css`: no importer (see the checks below).
- `app/admin/content/page.tsx` and `app/admin/data-transfer/page.tsx`: they only redirected. The redirects now live in `next.config.ts`.

## Checked and fine

- **Authentication.** Every admin API route checks a guard. The routes without one are the sign-in flow (`login`, `login/code`, `login/enroll`). They are public by design and rate-limited: per-IP and per-email lockout, plus durable limits on the code and enrolment steps. `notifications/push` is guarded by `getCurrentUser` and `orders.view`. A naive scan flagged it, but it is guarded.
- **Permissions.** Every mutating route checks a manage-level permission. The exceptions are the staff self-service routes (`profile`, `security`, `two-step`), which only touch the signed-in user's own record. `security` is rate-limited.
- **Audit trail.** Every mutating route writes an audit entry. The scan found no gaps.
- **Queries.** No string-built SQL. The one raw query uses the tagged-template form.
- **Errors.** `routeError` answers a `UserError` with its own message and any other error with a generic 500 line. Routes that used to echo an error's text now go through it (see item 3).
- **Staff list.** `GET /api/admin/users` selects only safe columns.

## Backlog, by priority

1. **Unbounded lists.** Twenty-six GET handlers have no limit: `activity` (the audit log, which grows forever), `media`, `collections`, `fulfillments`, `locations`, `metafields`, `pages`, `redirects`, `reports`, `analytics`, `analytics/discounts`, `customers/segments`, `customers/tags`, `roles`, `sales-channels`, `sales-channels/publications`, `settings`, `shipping`, `tax-rates`, `theme/review`, `users`, `webhooks`, `api-credentials`, `blog-posts`, `products/prices`, `products/[id]`. Start with `activity`, `media` and `collections`: add paging and a "load more" control.
   **Done.** `activity`, `media` and `collections` page with `readPaging` and a Load more control (checked in a browser on `activity`). The other list handlers cap their rows (`LIST_CAP`, `cappedJson`), the report routes refuse a period that is too large rather than cutting it, `theme/review` reads a fixed set of keys, and `products/[id]` returns one product. The exception was `roles`, which returned the custom-role list uncapped. Creating a role was already refused past 30, and the list read now uses the same cap (`MAX_CUSTOM_ROLES`) and reports when it has been cut.
2. **Dashboard load.** `app/admin/page.tsx` reads every inventory row on each visit to count low stock. Count in SQL and cache the dashboard data for about a minute.
   **Done.** The low-stock count and the other figures come from SQL aggregates in `lib/admin-dashboard-data.ts`, cached with `unstable_cache` for 60 seconds.
3. **Raw error messages.** `app/api/admin/orders/manual` returns any error's message, and the last branch of `routeError` passes plain `Error` messages through. Add a typed user-facing error and return a generic message for everything else.
   **Done.** `routeError` answers a `UserError` with its message and any other error with a generic line (#591). `orders/manual` keeps its own mapping, which already sends only typed messages. A follow-up on this branch moves 25 more routes that replied with an error's own text onto `routeError`, and sets the statuses that used to come from message text at the throw site (404 for a missing record, 409 for a conflict). The routes that still read the message send only a fixed list of messages (checkout, driver, back-in-stock, reviews, returns, account) or compare it to choose a status (sign-in and permission checks).
4. **A GET that writes.** `GET /api/admin/login/enroll` creates a TOTP secret and clears backup codes when none exists. Move that into POST.
   **Done.** The GET only reads. The secret is created and the backup codes are cleared in POST.
5. **Session length.** Admin sessions last 30 days (`SESSION_COOKIE_OPTIONS`). Use a shorter staff session, and ask for a password or two-step code before refunds, role changes and user removal.
   **Done.** Staff sessions end 12 hours after sign-in (`STAFF_SESSION_SECONDS` in `lib/session-limits.ts`): a staff cookie older than the limit stops working. The cookie itself still lasts 30 days. Refunds, role changes and staff removal ask for a recent confirmation (`assertRecentSignIn`), which a browser run exercised on a staff removal.
6. **Sign-in rate limit.** The per-IP limit uses the in-memory `consumeRateLimit`, which is per worker instance. Move it to `consumeDurableRateLimit`.
   **Done.** The admin sign-in uses `consumeDurableRateLimit`. The count is kept in the database, so it holds across worker instances; a browser run hit the limit as designed.
7. **Legacy pages.** `app/admin/content/page.tsx` and `app/admin/data-transfer/page.tsx` only redirect. Move those to redirects in the Next config.
   **Done.** `next.config.ts` redirects `/admin/content` to `/admin/online-store/theme-editor` and `/admin/data-transfer` to `/admin/products/import` (307), and the two pages are removed. Both were checked with curl against the production build.

## Add (recommended)

- Sign a staff member out everywhere, from Users & roles. **Done:** `POST /api/admin/users/sign-out`. Not clicked in the browser run.
- Require two-step sign-in for all staff, as a store setting. **Already required, and not a setting:** a staff account without two-step is sent to set it up before the admin opens. Checked in a browser. **Decided:** it stays always required; a store setting is not being added.
- An audit-log retention rule and export, alongside backlog item 1. **Done:** `lib/audit-retention.ts` prunes the log in the daily job, and the activity log exports CSV (checked in a browser).

## Checked on this branch

- **Unused CSS modules.** One was unused and is removed (`components/admin-orders-list.module.css`). The other 78 modules are imported by a component.
- **Confirm dialog on the WhatsApp list.** Remove asks first; Cancel keeps the number; Remove deletes it.
- **Customer account and the admin.** A customer signs in on the storefront and is not let into the admin. The admin sign-in refuses customer credentials.
- **Browser checks.** Run against the production build (`next start`) on a scratch database seeded by `prisma/seed.ts`, with the fixtures noted under Verification: staff set-up of two-step, re-confirm before a staff delete, sign-out, Export CSV, Load more, the WhatsApp confirm, the guest sign-in redirect, the customer sign-in and admin refusal, the customer credentials refused at the admin sign-in, and the 404 for an unknown order edit on commit and on discard.

## Found while checking

- `prisma/seed.ts` created the demo customer with the admin's password hash. Fixed on this branch: the `create` branch now stores the customer's own hash. A fresh database seeded this way opens both demo accounts with their documented passwords.
- `roles` had no read cap (see item 1). Resolved on this branch.

## Checked after the merge

- **Refunds, end to end.** A refund without a recent confirmation is refused with `REAUTH_REQUIRED`. The refund from the orders screen asks to confirm, then refunds (the `Refund issued.` notice). An over-refund answers 400 with the remaining amount; an unknown order answers 404; the rest of the amount completes the refund (`REFUNDED`); a refund after that is refused with `Only paid orders can be refunded`, because the payment status is checked before the remaining amount.
- **Sign out everywhere.** Signing a staff member out everywhere from Users & roles ends their session: their next request goes to sign-in.

## Verification

- `tsc` is clean. The suite passes: 1037 tests, including 14 from earlier passes in `tests/user-public`, `tests/safe-url` and `tests/admin-access`, and 3 new ones in `tests/route-error-replies.test.ts` and 4 in `tests/staff-roles-cap.test.ts`.
- `npm run backend:audit` passes. `npm run build:cloudflare` passes with the CI build settings, including the charset check.
- Browser checks: 11 of 11 pass against the production build, on a scratch Postgres 16 database seeded by `prisma/seed.ts`, with a temporary staff member, 60 extra audit rows and two WhatsApp numbers added for the checks. The checks were run in headless Chromium.
- Refund and sign-out checks: 9 of 9 pass against the production build, on a fresh scratch database seeded by the fixed `prisma/seed.ts`.
- Earlier measurements, taken against the local database and dev server before and after the first change: these admin pages return 200: `/admin`, `/admin/orders`, an order, `/admin/products`, `/admin/customers`, `/admin/customers/whatsapp`, `/admin/users` and `/admin/activity`.
