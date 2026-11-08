# ERP and POS: deployment and DNS

This describes what is actually running. The app is one Cloudflare Worker (`ecommerce-pro`, built with OpenNext from `wrangler.jsonc`) on the Cloudflare zone `yallahaul.com`, with one Neon Postgres database. Render is not used.

## 1. Hosts

| Host | Serves | Set by |
| --- | --- | --- |
| `yallahaul.com`, `www.yallahaul.com` | Storefront, and store tools under `/admin` | Custom domains on the Worker |
| `erp.yallahaul.com` | ERP modules under `/admin` | Workers Route `erp.yallahaul.com/*` |
| `pos.yallahaul.com` | Till at `/admin/pos`, returns, registers, receipts | Workers Route `pos.yallahaul.com/*` |

Host routing is in `proxy.ts` and `lib/admin-apps.ts`. A module requested on the wrong host redirects to the host that owns it. The host names come from three variables in `wrangler.jsonc`:

```json
"ERP_HOST": "erp.yallahaul.com",
"POS_HOST": "pos.yallahaul.com",
"STORE_HOST": "yallahaul.com"
```

Unset, the split is off and every admin page stays on one host.

## 2. Cloudflare DNS records

Check these in **yallahaul.com → DNS → Records**.

| Type | Name | Content | Proxy | Purpose |
| --- | --- | --- | --- | --- |
| AAAA | `erp` | `100::` | Proxied (orange) | Placeholder so the route can match. Traffic goes to the Worker. |
| AAAA | `pos` | `100::` | Proxied (orange) | Same, for the POS host. |

Do not remove or change the existing records for the storefront or email (`send`, the `cf-bounce` MX records, and the records Cloudflare added for `www` and the apex). They are not part of the ERP or POS.

The `100::` address is never answered by a server. The proxied record only makes Cloudflare handle the hostname, and the Worker route answers it.

## 3. Worker routes

**Workers & Pages → ecommerce-pro → Settings → Domains & Routes → Workers Routes** (or **Websites → yallahaul.com → Workers Routes**):

- Route `erp.yallahaul.com/*` → Worker `ecommerce-pro`
- Route `pos.yallahaul.com/*` → Worker `ecommerce-pro`

Do not add `yallahaul.com/*`: the storefront is attached as custom domains, and a route there would compete with them.

## 4. SSL

- The zone uses Cloudflare Universal SSL, which covers first-level subdomains such as `erp.` and `pos.`. Nothing needs to be bought or uploaded.
- SSL/TLS mode: **Full (strict)** is the recommended setting for the zone. Check it under **SSL/TLS → Overview**; it has not been verified in the dashboard for this guide. HSTS is set by the app in production (`lib/security-headers.ts`).
- A new hostname can take a few minutes to get its certificate. A connection error right after adding a route usually clears by itself.

## 5. Environment variables and secrets

Plain values, in `wrangler.jsonc` `vars` (a deploy overwrites dashboard-set values, so keep them in the file):

- `EMAIL_FROM`, `ERP_HOST`, `POS_HOST`, `STORE_HOST`

Secrets, set once with `npx wrangler secret put <NAME>` (see `PRODUCTION-OPS.md`):

- `AUTH_SECRET`: signs sessions and encrypts stored payment secrets. Changing it logs everyone out and breaks encrypted values.
- `CRON_SECRET`, `PAYMENT_WEBHOOK_SECRET`

GitHub Actions secrets used by the deploy job:

- `NEON_DATABASE_URL`: pooled connection string. The job also runs `prisma migrate deploy` with the direct URL.
- `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, Workers R2 Storage: Edit) and `CLOUDFLARE_ACCOUNT_ID`
- `RESEND_API_KEY` and the monitoring tokens listed in `PRODUCTION-OPS.md`

Never put the Neon API key or the Cloudflare deploy token in the Worker.

## 6. How a change reaches production

1. Work on a branch and open a PR to `main`.
2. CI runs `quality` (typecheck, tests, backend audit, dependency audit) and `postgres-staging` (migrations applied to a real Postgres, end-to-end browser test). Both must pass.
3. Merging to `main` runs CI again, then the **deploy** job:
   1. `prisma migrate deploy` against Neon. Every ERP and POS migration so far is additive: tables, columns and indexes only.
   2. `opennextjs-cloudflare deploy` uploads the Worker with the secrets.

Nothing is run by hand. To check a deploy, open the CI run for the merge commit and confirm `Apply database migrations` and `Deploy to Cloudflare Workers` both succeeded.

## 7. Checking it is live

```bash
curl -sI https://erp.yallahaul.com/admin/login     # 200
curl -sI https://pos.yallahaul.com/admin/login     # 200
curl -sI https://yallahaul.com/admin/orders        # 308 to https://erp.yallahaul.com/admin/orders
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://pos.yallahaul.com/api/admin/pos/sales   # 403 without a staff session
```

The storefront returns `503` with `Retry-After: 3600` while maintenance mode is on. That is intended; see `PRODUCTION-OPS.md`.

## 8. Rollback

- **Routing only:** remove `ERP_HOST` and `POS_HOST` from `wrangler.jsonc` and merge. Every admin page goes back to the storefront host.
- **Code:** revert the merge commit on `main` and merge the revert. The database migrations are additive, so reverting code never needs a database change. Old code ignores new columns and tables.
- **Hosts:** delete the two Workers Routes. The DNS placeholders can stay.

## 9. Staff access

Each host has its own sign-in, because the session cookie is host-only. Staff sign in on each host with the authenticator code (two-step login is mandatory for staff). A password or role change still ends sessions on every host.

## 10. Local testing

```bash
npm test                                   # unit tests, no database needed
POS_DB_TESTS=1 DATABASE_URL=postgresql://... npx tsx --test tests/pos-*.db.test.ts
npm run lint                               # typecheck
npx next build                             # production build
```

The till browser test runs against a built app on a test database. It writes test data and closes the owner's open shift, so use a throwaway database only:

```bash
npx next start -p 3100                     # after npx next build, with DATABASE_URL and AUTH_SECRET set
BASE_URL=http://localhost:3100 DATABASE_URL=postgresql://... \
  OWNER_EMAIL=owner@test.local OWNER_PASSWORD=... node scripts/e2e/pos-till.mjs
```

It needs `playwright-core` (or a global `playwright`). It is not in CI yet: the CI sign-in for the seeded admin already uses the authenticator, so a later step needs its own test account with a known authenticator secret.

The database tests create their own location, till, cashier, and products under a random tag, so they can run against a shared test database.
