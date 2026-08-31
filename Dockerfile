FROM node:22.23.2-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --no-audit --no-fund

FROM node:22.23.2-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js evaluates some server modules while collecting page data.
# This is a build-only placeholder; the real secret is injected by Render at runtime.
ENV AUTH_SECRET=build-only-auth-secret
RUN node scripts/build-compat-fix.mjs && \
    node scripts/finalization-fix.mjs && \
    node scripts/focal-finalization-fix.mjs && \
    node scripts/finalization-assert.mjs && \
    node scripts/final-ts-fix.mjs && \
    node scripts/backend-audit.mjs && \
    node scripts/prepare-mongodb-schema.mjs && \
    npx prisma generate --schema=prisma/mongodb-schema && \
    npm run typecheck && \
    npx next build

FROM node:22.23.2-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's native query engine needs system OpenSSL at runtime as well as build time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app ./
EXPOSE 10000
CMD ["sh", "-c", "node scripts/verify-production-database.mjs && npx next start -H 0.0.0.0 -p ${PORT:-10000}"]
