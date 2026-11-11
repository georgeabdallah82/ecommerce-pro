# Admin audit, November 2026

Scope: the admin panel (`app/admin/**`, 79 pages), its API (`app/api/admin/**`, 113 routes), the admin layout and the shared admin components.

Method: a script over every admin route (guard, permission per HTTP method, audit call, error replies, list queries without a limit, user rows in responses); reading each route the script flagged; and a before-and-after measurement of the leaks against the local database over HTTP.

## Summary

- Highest risk found: staff browsers received password hashes and two-step fields. Fixed.
- Parcel tracking links accepted `javascript:` addresses that the admin renders as links. Fixed.
- Customer accounts could load the admin shell. Fixed.
- Two dead components removed. A storefront test was still reading one of them; it now checks the live homepage.
- The remaining items are a backlog, listed below by priority.

## Fixed in this branch

| ID | Severity | Finding | Evidence | Fix | Measured |
|---|---|---|---|---|---|
| F1 | High | Staff browsers received password hashes and two-step fields | Order page HTML held a staff bcrypt hash and the `totpSecret` and `totpBackupCodes` keys. The order-note response held a hash. | `lib/user-public.ts` (`publicUserSelect`) on the orders API (list and notes), the orders page, the dashboard and the order page. The staff list uses the same select. | Hashes on the order page: 1 → 0. Hash in the note response: 1 → 0. |
| F2 | High | Parcel and order tracking links accepted any text, including `javascript:` addresses, and the admin page renders them as links | `app/api/admin/fulfillments/[id]` and `app/api/admin/orders` stored the raw value. `components/order-detail-admin.tsx` rendered it as `href`. | `lib/safe-url.ts` (`safeHttpUrl`). Both routes reply 400 for anything that is not http or https, and the page shows a link only when it is valid. | `javascript:` → 400 on both routes. An `https` link → 200. |
| F3 | Medium | A customer account could load the admin shell. The layout only checked for a signed-in user; pages guard their own data, so no data was exposed. | `app/admin/layout.tsx` | Customer accounts are sent to sign-in. The team-notice board is only rendered after that check. | Covered by tests. Not yet tried with a customer session. |
| F4 | Low | Removing a number from the WhatsApp list deleted it on one click | `components/whatsapp-list.tsx` | Confirm dialog first | Covered by a test. Not yet clicked in a browser. |

Latent, now closed by F1: the orders API, the orders page and the dashboard included full customer rows for orders placed from an account. Those rows carry the customer's password hash.

## Removed

- `components/admin-sales-chart.tsx`: no imports.
- `components/aliexpress-home.tsx`: no imports; the storefront doesn't render it. A storefront accessibility test still read it. That test now checks the live homepage (`app/page.tsx`) and the product page.

## Checked and fine

- **Authentication.** Every admin API route checks a guard. The routes without one are the sign-in flow (`login`, `login/code`, `login/enroll`). They are public by design and rate-limited: per-IP and per-email lockout, plus durable limits on the code and enrolment steps. `notifications/push` is guarded by `getCurrentUser` and `orders.view`. A naive scan flagged it, but it is guarded.
- **Permissions.** Every mutating route checks a manage-level permission. The exceptions are the staff self-service routes (`profile`, `security`, `two-step`), which only touch the signed-in user's own record. `security` is rate-limited.
- **Audit trail.** Every mutating route writes an audit entry. The scan found no gaps.
- **Queries.** No string-built SQL. The one raw query uses the tagged-template form.
- **Errors.** `routeError` returns a generic 500 for internal errors.
- **Staff list.** `GET /api/admin/users` selects only safe columns.

## Backlog, by priority

1. **Unbounded lists.** Twenty-six GET handlers have no limit: `activity` (the audit log, which grows forever), `media`, `collections`, `fulfillments`, `locations`, `metafields`, `pages`, `redirects`, `reports`, `analytics`, `analytics/discounts`, `customers/segments`, `customers/tags`, `roles`, `sales-channels`, `sales-channels/publications`, `settings`, `shipping`, `tax-rates`, `theme/review`, `users`, `webhooks`, `api-credentials`, `blog-posts`, `products/prices`, `products/[id]`. Start with `activity`, `media` and `collections`: add paging and a "load more" control.
2. **Dashboard load.** `app/admin/page.tsx` reads every inventory row on each visit to count low stock. Count in SQL and cache the dashboard data for about a minute.
3. **Raw error messages.** `app/api/admin/orders/manual` returns any error's message, and the last branch of `routeError` passes plain `Error` messages through. Add a typed user-facing error and return a generic message for everything else.
4. **A GET that writes.** `GET /api/admin/login/enroll` creates a TOTP secret and clears backup codes when none exists. Move that into POST.
5. **Session length.** Admin sessions last 30 days (`SESSION_COOKIE_OPTIONS`). Use a shorter staff session, and ask for a password or two-step code before refunds, role changes and user removal.
6. **Sign-in rate limit.** The per-IP limit uses the in-memory `consumeRateLimit`, which is per worker instance. Move it to `consumeDurableRateLimit`.
7. **Legacy pages.** `app/admin/content/page.tsx` and `app/admin/data-transfer/page.tsx` only redirect. Move those to redirects in the Next config.

## Add (recommended)

- Sign a staff member out everywhere, from Users & roles. The data exists already (`sessionsRevokedAt`).
- Require two-step sign-in for all staff, as a store setting. The two-step data exists already.
- An audit-log retention rule and export, alongside backlog item 1.

## Not yet checked

- Unused CSS modules.
- Browser behaviour of the confirm dialog on the WhatsApp list.
- A customer-account sign-in to the admin, which needs a customer session in the test data.

## Verification

- `tsc` is clean. The suite passes: 989 tests, including 14 new ones in `tests/user-public`, `tests/safe-url` and `tests/admin-access`. Three existing assertions were updated to the live code.
- Against the local database and dev server, the measurements above were taken before and after the change. These admin pages return 200: `/admin`, `/admin/orders`, an order, `/admin/products`, `/admin/customers`, `/admin/customers/whatsapp`, `/admin/users` and `/admin/activity`.
