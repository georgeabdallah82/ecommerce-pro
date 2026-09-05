# Node origin deployment

This is the production-safe hosting target for the full-stack ecommerce application.

## Architecture

Cloudflare DNS/proxy -> Node 22 + Next.js -> Prisma -> MongoDB Atlas.

Cloudflare Worker `ecommerce-pro-cron` runs the expired-reservation cleanup every 10 minutes and calls the existing internal endpoint with `CRON_SECRET`.

## Runtime

- Node.js: 22.23.2
- Next.js: 15.5.24
- Prisma: 6.15.x
- Database: MongoDB Atlas
- Port: 10000
- Bind address: 0.0.0.0

## Container

The repository includes a production Dockerfile. The image uses Next.js standalone output and starts with `node server.js`.

Build:

`docker build -t ecommerce-pro .`

Run:

`docker run --rm -p 10000:10000 --env-file .env.production ecommerce-pro`

Required production variables include `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `PAYMENT_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL`. See `.env.example` for the full application environment surface.

## Oracle Always Free target

The intended no-monthly-hosting-cost target is an OCI Always Free Ampere A1 VM running the container. Oracle currently includes 1,500 OCPU-hours and 9,000 GB-hours per month for A1 compute, equivalent to 2 OCPUs and 12 GB RAM for an Always Free tenancy. The Always Free resources are available indefinitely within the published limits.

Create the VM in the OCI home region and select an Always Free eligible A1 shape. Keep the VM within the Always Free CPU/RAM allocation.

## Reverse proxy

For the first cutover, run the application container on the VM and terminate HTTPS at the VM with Caddy or Nginx. Cloudflare can then proxy the public hostname to the VM. Use Cloudflare Full (strict) once the origin has a valid certificate.

## Media

The admin upload route currently writes uploaded images under `public/uploads`. This is acceptable on a single persistent VM for the initial cutover, but object storage (Cloudflare R2) should be used before introducing multiple app replicas or an immutable/replaced filesystem. Existing media stored only on the Netlify runtime filesystem must be migrated separately if they are not already external URLs.

## Safety

Do not point the production domain at the VM until:

1. `/api/health` returns healthy.
2. Authentication and admin access work.
3. Product/catalog reads work.
4. COD checkout works and inventory reservations are correct.
5. Payment/webhook flows are tested.
6. Cron cleanup is running from Cloudflare.
7. Existing Netlify remains available as rollback until final sign-off.
