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

Configure the same application variables documented in `.env.example` as Cloudflare Worker secrets. At minimum:

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

The application uses MongoDB through Prisma. Cloudflare Workers cannot open MongoDB's raw TCP connection, so production requests run through Prisma Accelerate. Set the Worker's `DATABASE_URL` secret to the Prisma Accelerate `prisma://` connection string, while direct `mongodb://` or `mongodb+srv://` URLs are reserved for Prisma schema pushes and migration tooling.

Before switching production traffic, follow the backup, migration, secret, scheduled-worker, and smoke-test procedures in [PRODUCTION-OPS.md](PRODUCTION-OPS.md). In particular, validate login, registration, admin login, checkout, order creation, and administrative CRUD against the deployed Worker and its production MongoDB data.

## Local Workers-runtime preview

```bash
npm ci
npm run preview
```

This builds the Next.js app with OpenNext and runs the generated Worker locally through Wrangler.

## Deploy from the CLI

```bash
npx wrangler login
npm run deploy
```

Alternatively, connect the GitHub repository to Cloudflare Workers Builds and use `npm run build:cloudflare` as the build command. Cloudflare can then deploy the generated Worker on merges to the production branch.
