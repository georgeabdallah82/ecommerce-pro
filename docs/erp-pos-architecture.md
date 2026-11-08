# Yalla Haul: ERP and POS architecture (Phase 1)

Status: audit and recommendation. No application code changed in this phase.
Scope: `yallahaul.com` (storefront, existing), `erp.yallahaul.com` (new), `pos.yallahaul.com` (new).

## 1. Corrections to the working assumptions

| Assumption | Repository reality |
| --- | --- |
| Next.js 15.5.24 | Next.js **16.4.2** (`package.json`), React 19.2.8, Prisma 6.19.3 |
| Hosted on Render | Hosted on **Cloudflare Workers** via OpenNext (`wrangler.jsonc`, `open-next.config.ts`), database on **Neon** Postgres (Prisma driver adapters in `lib/prisma.ts`) |

Everything below is based on those versions.

## 2. What already exists (verified in code)

The database is larger than the admin navigation suggests. Models are split across `prisma/schema.prisma` and `prisma/models/shopify-parity.prisma`; 19 migrations; `prisma validate` passes; CI's `migrate diff` check is clean, so the migrations match the schema.

**Already modelled and wired into admin routes with transactions:**

- Products and variants: `Product.costPrice`, `ProductVariant.price`, `sku` (unique), `barcode` (unique). Product CRUD, duplicate, bulk price changes, and bulk delete exist.
- Inventory: `InventoryItem` (quantity, reserved, low-stock threshold, per product/variant/location), `InventoryMovement` ledger, `StoreLocation`.
- Transfers: `InventoryTransfer` and `InventoryTransferItem`, with routes in `app/api/admin/inventory/transfers`.
- Purchase orders: `PurchaseOrder` and `PurchaseOrderItem`, routes and pages in `app/admin/purchase-orders`. Supplier is only a free-text `supplierName`, not a table.
- Returns: `ReturnRequest` and `ReturnItem`, with routes in `app/api/admin/returns`.
- Refunds: route `app/api/admin/refunds`.
- Customers: `User` with `role = CUSTOMER`. Store credit, coins, tags, and segments exist.
- Orders: `Order`, `OrderItem`, `OrderEvent`, `PaymentTransaction`, `PaymentProof`, `Fulfillment`, `DraftOrder`, `OrderEdit`.
- Audit: `AuditLog` and an `audit()` helper used by admin mutations.
- Staff access: `Role` enum (SUPER_ADMIN, ADMIN, MANAGER, SUPPORT, EDITOR, CUSTOMER), custom staff roles (`lib/staff-roles.ts`), about 70 permissions (`lib/permissions.ts`), and `requirePermission` on admin routes. Mandatory 2-step login for staff is in place.

**Concurrency today:** stock is protected by conditional writes, not row locks. `lib/inventory.ts` reserves with `updateMany({ where: { reserved: { lte: quantity - canReserve } } })` and checks `count === 1`. Releases and fulfilment use the same pattern. There is no `SELECT ... FOR UPDATE` anywhere. This is sound for online checkout. POS needs the same guarantee plus an idempotency key (see section 5).

## 3. What is missing for ERP and POS

| Area | Gap |
| --- | --- |
| Sales channel | `Order` has no `channel` (ONLINE / POS), no `locationId`, no register or cashier. Online and POS sales cannot be separated in reports. |
| Payments | `PaymentMethod` is `COD, CARD, BANK_TRANSFER, WALLET`. No CASH, no split payments, no Whish or OMT as methods. Whish and OMT appear only as wording in bank-transfer proof (`lib/payment-proof.ts`). |
| Currency | `Order.currency` defaults to USD. LBP is display-only (`lib/selling.ts`: a rate in settings, rounded to 1,000 LBP). No rate is saved per transaction, so historical LBP amounts cannot be reproduced. |
| Registers and shifts | No `Register`, `CashierShift`, or cash-in/cash-out model. No discrepancy record. |
| Suppliers | No `Supplier` table; purchase orders hold a string. No supplier-product link or supplier price history. |
| Stock counts | No `InventoryCount` / stocktake model (the `inventory/count` page exists; I have not yet traced what it persists). |
| Cost history | `costPrice` is a single value on `Product`; there is no history, so historical margin cannot be recomputed. |
| Money units | Money fields are integers. I have **not yet confirmed** whether they are cents or whole dollars. This must be checked before Phase 2. |

## 4. Authentication and the subdomain question

The session is a JWT in cookie `session`, set in `lib/auth.ts:23` with `httpOnly`, `sameSite: 'lax'`, `path: '/'`, and **no `domain` attribute**. The cookie is host-only: a staff session on `yallahaul.com` is not sent to `erp.yallahaul.com` or `pos.yallahaul.com`.

Options:

1. **Host-only cookie per app (recommended).** Staff sign in once per host with the existing 2-step login. Revocation (`sessionsRevokedAt`) is per user in the database, so a password change or role change still ends sessions on every host. The storefront origin never sees staff cookies.
2. **Cookie with `Domain=.yallahaul.com`.** One sign-in everywhere. Rejected for now: the staff cookie is then sent to the storefront origin too, and any future storefront XSS can read it (it is httpOnly, but any request from that origin carries it), so the blast radius grows. It also needs a broader CSRF review.
3. **Token exchange (later, if needed).** The storefront issues a one-time, short-lived handoff token that the ERP exchanges for its own host-only cookie. More code; only worth it if staff complain about signing in twice.

**Recommendation: option 1.** It is the smallest change and keeps the storefront isolated from staff sessions.

## 5. Recommended architecture

**One repository, one Worker deployment, one Postgres.** The three domains are host-based routes in the same Worker, not three apps.

- `proxy.ts` routes by host: `erp.yallahaul.com/*` serves the ERP area, `pos.yallahaul.com/*` serves the POS area, `yallahaul.com` is unchanged. Each host gets its own CSP and a `frame-ancestors 'none'` policy, and the POS area gets its own permission checks.
- Shared business logic moves into `lib/domain/` (no Next.js imports): products, inventory, orders, payments, returns, shifts. Both the existing admin routes and the new ERP and POS routes call these services. This removes duplicate stock logic.
- Why not three deployments: one schema, one set of transactions, one CI pipeline, one secret set, and a single source of truth for stock. Separate deployments would need cross-service stock calls, which is where overselling starts.

**Stock and sales correctness:**

- All stock changes go through the `lib/domain/inventory` service, inside `db.$transaction`. POS sales and receipts take a row lock (`SELECT ... FOR UPDATE` via `$queryRaw`) on the affected `InventoryItem` rows, in a fixed order (by id) to avoid deadlocks, and keep the existing conditional-update pattern as a second guard.
- Every POS sale carries a client-generated `idempotencyKey` with a unique index on `Order`. A retried submit (flaky network, double tap) returns the original order and does not create a second sale or a second stock deduction.
- Every stock change writes an `InventoryMovement` row with type, quantity, reason, reference, user, and timestamp. The ledger is the only source for valuation.

**Money and currency:**

- Store amounts as integers in the smallest unit. Confirm the current unit before migrating (open question below).
- Each POS transaction stores an **exchange-rate snapshot**: rate, rate source, timestamp, and the LBP amount actually charged (rounded with the same rule as `lib/selling.ts`). Reports use the stored snapshot, never today's rate.
- Payments are split rows (`PaymentLine`: method, currency, amount, reference). Methods: CASH, CARD, BANK, WHISH, OMT, OTHER. Whish and OMT are recorded as manual settlements unless the owner confirms an API integration is wanted.

**Reporting separation:** revenue (what customers paid), cost (`costPrice` snapshot taken at the time of sale, stored on `OrderItem`), and profit (revenue minus cost minus discounts and refunds) are computed as separate columns. Cost is snapshotted on the sale line so later price changes do not rewrite history.

**RBAC:** extend `lib/permissions.ts` with the requested role presets (ERP Administrator, Inventory Manager, Cashier, Sales Manager, Viewer) mapped onto existing permissions, plus `pos.*` permissions. Enforcement stays on the server in each route with `requirePermission`. The backend audit script (`scripts/backend-audit.mjs`) is extended to cover the new routes.

**Hardware (POS):** keyboard-wedge barcode scanners (they type into the focused field, so no driver is needed); receipts printed through the browser with 58 mm and 80 mm CSS print styles, so no printer driver is needed for the first version. Cash drawer: opened manually, not automatically.

## 5a. Module split and host routing (implemented)

Every admin module is assigned to one app in `lib/admin-apps.ts`:

- **ERP** (`erp.`): dashboard, team notices, orders, drivers, returns, draft orders, order edits, products, collections, inventory and stock tools, operations, purchase orders, customers and segments, gift cards, reports, shipping, tax, data transfer, users and roles, activity log, settings, health pages.
- **Store** (stays on the storefront host): online store (theme editor, navigation, policies), content, files, metafields, discounts, bundles, marketing, newsletter, push campaigns, live visitors, reviews, questions.
- **POS** (`pos.`): the till (`/admin/pos`), a placeholder until the POS phase.
- **Shared** (any host): login, two-step pages and anything not listed.

Routing is controlled by three environment variables. While `ERP_HOST` and `POS_HOST` are both unset, nothing changes and every admin page stays on one host.

| Variable | Example | Purpose |
| --- | --- | --- |
| `ERP_HOST` | `erp.yallahaul.com` | Host that serves ERP modules |
| `POS_HOST` | `pos.yallahaul.com` | Host that serves POS modules |
| `STORE_HOST` | `yallahaul.com` | Host that serves storefront modules |

`proxy.ts` redirects (308) a module request that arrives on the wrong host to the owning host. Storefront pages requested on the ERP or POS host go to that host's home. Admin APIs are not redirected, so each page calls its API on the host it is served from. Staff sign in separately on each host, because the session cookie is host-only (section 4).

Before enabling: create the DNS records and attach `erp.` and `pos.` to the Worker (Phase 6 documents the steps), then set the three variables in the Worker environment.

## 6. Phased plan

| Phase | Deliverable | Notes |
| --- | --- | --- |
| 1 | This document | Done, pending owner review. |
| 2 | `lib/domain/` services, `Order.channel`/`locationId`, `PaymentLine`, `Register`, `CashierShift`, `Supplier`, `InventoryCount`, cost snapshot on `OrderItem`, `Order.idempotencyKey` | Schema migration on production Neon. Needs owner go-ahead before running. |
| 3 | ERP app: dashboard, products, inventory, suppliers and purchase orders, unified sales list, customers, reports | Reuses existing admin pages where they work. |
| 4 | POS app: scanner-first sale screen, split payments, LBP snapshot, receipts 58/80 mm, shifts, cash in/out, returns and refunds | Touch-first layout. |
| 5 | Host routing in `proxy.ts`, cross-host tests, concurrency tests (parallel sales of the last unit) | Storefront regression suite must stay green. |
| 6 | Deployment docs: Cloudflare DNS records, custom domains for Workers, SSL, environment variables, rollback | Written after the code exists. |

The storefront stays on the same deployment throughout. Each phase is its own PR.

## 7. Decisions needed from the owner

1. **SSO:** accept option 1 (sign in separately on each subdomain), or ask for option 2 knowing the trade-off?
2. **Whish and OMT:** manual settlement only, or an API integration?
3. **Exchange rate:** one rate set in Settings (current behaviour), or a rate entered per shift?
4. **Cash discrepancy tolerance:** an amount below which a shift closes without a flag?
5. **Registers per location:** one register per store location, or several?

## 8. Open items I have not yet verified

- Money unit (cents or whole dollars) in `Product.basePrice`, `Order.grandTotal`, and `ProductVariant.price`.
- What the `inventory/count` page persists, if anything.
- The `LiveVisitorSession` table in the baseline migration with no matching model.
- Whether `Product.costPrice` is ever written by the existing product import.
