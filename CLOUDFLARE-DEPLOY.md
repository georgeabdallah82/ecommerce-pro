# Cloudflare Workers deployment

This app is configured for Cloudflare Workers with the OpenNext adapter.

## Cloudflare Worker settings

- Worker name: `ecommerce-pro`
- Build command: `npm run build:cloudflare`
- Root directory: `/`
- Compatibility date: `2026-09-08`
- Compatibility flags: `nodejs_compat`, `global_fetch_strictly_public`

The Cloudflare Worker entrypoint is generated at `.open-next/worker.js` and static assets at `.open-next/assets`.

## Production variables and secrets

Configure the same application variables currently documented in `.env.example` in the Cloudflare Workers deployment environment. At minimum:

- `AUTH_SECRET`
- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_BRAND_NAME`
- `NEXT_PUBLIC_COUNTRY`
- `NEXT_PUBLIC_CURRENCY`
- `NEXT_PUBLIC_LOCALE`

Add the remaining payment, webhook, password-reset email, and push-notification variables when those features are enabled.

Do not commit real secret values to GitHub. Store sensitive values as Cloudflare Worker secrets.

## Database

The application currently uses PostgreSQL through Prisma. Cloudflare Workers requires an edge-compatible Prisma database driver; the repository includes the PostgreSQL driver adapter dependencies needed for that integration.

Before production traffic is switched over, verify the production `DATABASE_URL` points to the existing PostgreSQL database and validate login, registration, admin login, checkout, orders, and admin CRUD operations against that database.

## Local Workers-runtime preview

```bash
npm install
npm run preview
```

This builds the Next.js app with OpenNext and runs the generated Worker locally through Wrangler.

## Deploy from the CLI

```bash
npx wrangler login
npm run deploy
```

Alternatively, connect the GitHub repository to Cloudflare Workers Builds and use `npm run build:cloudflare` as the build command. Cloudflare can then deploy the generated Worker on merges to the production branch.
