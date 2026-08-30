# PostgreSQL → MongoDB Production Migration

## Goal
Move the ecommerce production data layer from the current Render PostgreSQL database to MongoDB Atlas without changing customer/admin behavior or losing data.

## Current state
- Application: Next.js 15
- ORM: Prisma 6.15
- Current database: PostgreSQL
- Current IDs: Prisma `cuid()` string IDs
- Current production deployment target: Netlify
- Current PostgreSQL database must remain untouched until cutover is verified.

## Target state
- Application: Next.js
- ORM: Prisma MongoDB connector (Prisma 6.19 for the migration phase)
- Database: MongoDB Atlas replica set
- Deployment: Netlify
- `DATABASE_URL`: MongoDB Atlas connection string stored only in Netlify/local secret storage

## Important compatibility work
MongoDB does not support Prisma composite `@@id`, so the `CollectionProduct` composite primary key must become a normal string `_id` plus a compound unique index. MongoDB also has different rules for compound unique indexes containing optional fields, so `InventoryItem` uniqueness must be represented with a deterministic inventory key rather than relying on the current nullable compound unique constraint.

The application uses relational queries heavily, so the MongoDB Prisma schema must preserve relation scalar IDs and existing CUID values. We will keep existing CUID strings rather than converting all records to ObjectIds. Prisma supports string IDs using `cuid()` in MongoDB when the underlying `_id` is not an ObjectId.

## Cutover procedure
1. Create MongoDB Atlas production cluster with replica set enabled.
2. Create least-privilege application database user.
3. Configure network access for Netlify/server runtime.
4. Create a disposable staging database/cluster first.
5. Add MongoDB-specific Prisma schema on the migration branch.
6. Upgrade Prisma from 6.15 to 6.19 for MongoDB compatibility.
7. Update schema constraints that MongoDB does not support.
8. Audit all `$transaction`, `createMany`, nested writes, raw SQL, and provider-specific queries.
9. Build a deterministic PostgreSQL → MongoDB export/import script.
10. Import into staging.
11. Compare record counts and referential integrity for every model.
12. Run the full CI suite against staging MongoDB.
13. Test storefront, customer auth, admin auth, products, variants, inventory, checkout, orders, payments, reviews, reports, import/export, settings, themes, notifications, and visitor analytics.
14. Repeat the import against production Atlas.
15. Freeze writes briefly during final delta sync.
16. Verify counts/checksums and smoke-test production.
17. Switch Netlify `DATABASE_URL` to Atlas.
18. Keep Render PostgreSQL read-only/available as rollback until the production observation window passes.
19. Only then retire the old PostgreSQL service.

## Secrets
Never commit Atlas credentials, passwords, connection strings, VAPID private keys, payment secrets, auth secrets, or admin passwords to GitHub.

## Required Atlas input
Before the migration can connect to a real target, the owner must create the Atlas cluster/database user and provide the resulting MongoDB connection string directly to Netlify/local secret storage. The connection string must not be pasted into GitHub or chat.

## Rollback
Rollback is simply restoring the previous PostgreSQL `DATABASE_URL` in Netlify while PostgreSQL remains intact. No destructive PostgreSQL operation is permitted until MongoDB production has been verified.
