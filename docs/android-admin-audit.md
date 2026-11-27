# Yalla Haul — repository audit for the Android admin app

Date: 27 November 2026. Scope: the whole `ecommerce-pro` repository, to decide how a native Android
admin app connects to the existing store without a second backend or database.

## 1. What the store is

| Area | Finding |
|---|---|
| Framework | Next.js 16 (App Router, `proxy.ts` middleware), React 19, TypeScript 7 |
| Runtime | Cloudflare Workers through OpenNext (`wrangler.jsonc`, `worker.ts`), R2 bucket for media, one Durable Object (live chat), two cron triggers |
| Database | PostgreSQL (Neon in production) via Prisma 6 with the driver-adapter client; 37 migrations; ~120 models incl. `prisma/models/shopify-parity.prisma` |
| API | ~200 route handlers: ~120 under `/api/admin/*`, storefront, internal cron jobs, payment webhooks, and `/api/v1/products` (API-key) |
| Tests | 1,502 tests (`node:test` + `tsx`), mostly source-level guards plus pure-logic tests; `npm run backend:audit`; CI deploys on merge to `main` |
| Money | Integers in minor units (cents); currency from the `store.currency` setting |

## 2. Authentication and authorization (reused as is)

* **Sessions**: HS256 JWT in an httpOnly `session` cookie, signed with `AUTH_SECRET`
  (`lib/auth.ts`). Customers 30 days; **staff 12 hours** (`lib/session-limits.ts`).
* **2-step login is mandatory for staff** (TOTP, encrypted secret, replay protection via
  `totpLastStep`, backup codes). A staff account without it gets no session anywhere.
* **Revocation**: `User.sessionsRevokedAt` ("sign out everywhere", password/role change).
* **Brute force**: durable per-IP and per-email limits plus an account lockout table; owner is
  alerted on lockouts and on sign-ins from new devices.
* **Permissions**: 60 fine-grained permissions, five built-in roles plus custom staff roles,
  enforced server-side in every admin route (`requirePermission`).
* **CSRF**: mutations carrying the session cookie must be same-origin (`proxy.ts`).
* **Re-authentication** (password/code within 10 minutes) for refunds, role changes, removing staff.

## 3. Feature inventory relevant to the app

| Module | Existing backend | App uses |
|---|---|---|
| Orders | `GET/PATCH /api/admin/orders` — search, status filter, counts, full status machine (stock reservation/fulfilment, refunds on cancel, COD auto-paid, emails, WhatsApp, webhooks, audit) | List + all changes through this route. **Missing**: single-order JSON (the web page is a server component) → added |
| Products | `GET/POST /api/admin/products`, `GET/PATCH /api/admin/products/[id]`, `POST /api/admin/media/upload` (R2, sniffed types, 5 MB) | Reused unchanged |
| Collections | `GET /api/admin/collections` | Reused |
| Inventory | `GET /api/admin/inventory` (returns every row with history, unpaged), `PATCH` (movement log, reserved-stock guard, low-stock + back-in-stock alerts, webhooks) | PATCH reused; **added** a paged/searchable list |
| Customers | `GET /api/admin/customers`, `GET /api/admin/customers/[id]` (spend nets out refunds) | Reused |
| Discounts | `GET/POST/PATCH/DELETE /api/admin/coupons` | Reused |
| Dashboard | Server-component aggregates (`lib/admin-dashboard-data.ts`), no JSON endpoint | **Added** `/api/mobile/v1/dashboard` |
| Notifications | Web Push (VAPID) to staff browsers, via one function `sendToSubscriptions` in `lib/push.ts` | **Added** FCM fan-out + alert history at that single point |
| Profile | `GET/PATCH /api/admin/profile` | Reused |

Sold-out behaviour: a product that reaches zero stock stays **Active and visible** with a "Sold out"
label (`lib/card-stock.ts`); only `continueSellingWhenOutOfStock`/pre-order keep it purchasable. The
app never changes product status on stock changes, so this is preserved.

## 4. Gaps found and decisions

1. **No way for a native app to authenticate.** Cookies + 2-step tickets in cookies are browser
   flows. → Added app sign-in endpoints that run the *same* checks with the *same* rate-limit keys,
   lockout table and TOTP replay counter, and return a bearer token. `getCurrentUser()` accepts the
   bearer token only when there is no cookie, only for staff, and applies revocation, 2-step and the
   12-hour shift limit unchanged. Result: **every existing admin endpoint and permission works for
   the app with no duplication of business logic.**
2. **Missing JSON endpoints**: dashboard aggregates, single order, paged inventory → added under
   `/api/mobile/v1`.
3. **No native push.** → FCM HTTP v1 sender (`lib/fcm.ts`) using a service account held as the
   server secret `FCM_SERVICE_ACCOUNT_JSON`; plus a 30-day alert history so the app works (15-minute
   checks) before Firebase is configured.
4. **No schema change was needed.** App devices are `Setting` rows (as staff browser push already
   is); alert history uses the existing `Notification` table with a `staff.` type prefix.

## 5. Issues fixed along the way

* `GET /api/admin/customers` answered **500 for signed-out/forbidden callers**; now 401/403 like the
  other routes (a client could not tell an expired session from a server failure).
* App 2-step tickets are single-use (a ticket issued before the account's last sign-in is refused),
  matching the web, which clears its ticket cookie.

## 6. Remaining observations (not changed — outside the app's scope or need owner decision)

* `GET /api/admin/inventory` loads every inventory row with 50 movements each; it will get slow as
  the catalogue grows. The app uses the new paged endpoint instead.
* The low-stock alert fires on every stock-reducing change while below threshold (documented in
  `lib/push.ts`), so a busy low item can alert repeatedly.
* `CLOUDFLARE-DEPLOY.md` still describes MongoDB/Prisma Accelerate; production is Neon PostgreSQL
  (README and PRODUCTION-OPS.md are correct).
* Refunds, returns, order edits, staff management and theme editing stay web-only in the app on
  purpose (they need re-authentication or large editors).

## 7. Security posture of the integration

* No database credentials, `AUTH_SECRET` or Firebase keys in the APK (verified by scanning the
  built release APK). The app only knows the store's public URL.
* Token: own type + audience (cookie tokens can't be replayed as bearer tokens and vice versa),
  12-hour lifetime, encrypted at rest with an Android Keystore AES-GCM key, excluded from backups,
  sent only to the store's host.
* HTTPS only (network security config; system CAs only). Release build minified, no debug logs.
* App routes are exempt from maintenance mode like `/api/admin`, are `private, no-store`, and need
  no CSRF check (browsers never attach a bearer token by themselves).
* Notifications on the lock screen show a generic text; customer details only after unlocking.
