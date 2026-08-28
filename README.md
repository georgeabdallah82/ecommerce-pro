# Production-Ready E-commerce Foundation

A full-stack Next.js + Prisma ecommerce platform with a clean storefront and an operations-focused Control Center. The brand stays configurable through environment settings.

## Included

### Storefront
- Responsive homepage, shop, categories and collections
- Search, category filtering and price sorting
- Product pages with variants and stock visibility
- LocalStorage cart with quantity management
- Checkout with server-side revalidation
- Cash on delivery, bank transfer, wallet and payment-provider abstraction
- Coupon support
- Shipping zones and rates
- Tax setting
- Customer accounts, saved addresses and order history
- Wishlist
- Verified-purchase review submission and moderation

### Control Center
- Dashboard with live KPIs and action queues
- Product catalog and archive flow
- Inventory, reservations and adjustment history
- Orders, statuses, fulfillment and tracking
- Customers
- Staff users and role-based permissions
- Categories and collections
- Coupons
- Reviews moderation
- Shipping zones/rates
- Homepage content blocks
- Media library plus local image upload endpoint
- Reports
- Settings
- Audit log

### Core engineering
- Prisma schema with commerce entities
- JWT session cookie authentication
- bcrypt password hashing
- Server-side role/permission enforcement
- Zod checkout validation
- Transactional checkout flow with inventory reservation
- Audit logging for admin mutations
- Payment-provider abstraction
- Configurable brand, currency, locale and country

## Local setup

Requires Node.js 20.11+.

```powershell
npm install
Copy-Item .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open:
- Storefront: http://localhost:3000
- Control Center: http://localhost:3000/admin
- Login: http://localhost:3000/account/login

### Seed accounts

Admin:
- Email: `admin@example.com`
- Password: value of `SEED_ADMIN_PASSWORD` (defaults to `ChangeMe123!`)

Demo customer:
- Email: `customer@example.com`
- Password: `Customer123!`

### Configuration

Set these in `.env` before deployment:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
AUTH_SECRET="replace-with-a-long-random-secret-at-least-32-characters"
NEXT_PUBLIC_BRAND_NAME="Your Brand"
NEXT_PUBLIC_CURRENCY="USD"
NEXT_PUBLIC_COUNTRY="Lebanon"
NEXT_PUBLIC_LOCALE="en-US"
NEXT_PUBLIC_WHATSAPP_NUMBER=""
SEED_ADMIN_PASSWORD="ChangeMe123!"
PAYMENT_PROVIDER="manual"
```

## Production notes

The application includes a payment-provider adapter and manual payment methods, but a live card gateway still needs the merchant credentials and webhook configuration for the provider you choose. Local image upload is included for traditional Node deployments; serverless production should switch the media adapter to an object-storage provider.

Before a real production launch, configure a managed database/storage provider, HTTPS, backups, error monitoring, transactional email, payment webhooks, and deployment secrets.

## Verification

The production CI pipeline runs dependency installation, Prisma generation, TypeScript typechecking, the backend audit, and the Next.js production build. Render must complete its build and start the resulting service before live functional verification is considered complete.

Recommended verification after install:

```powershell
npm install
Copy-Item .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
npm run typecheck
npm run build
npm run dev
```

## Shopify-style v3 refinement

This revision adds a visual Theme Studio and a full product editor designed around the same core workflows found in modern Shopify admin without copying Shopify source or assets.

### Theme Studio
- Visual section tree with reorder, visibility, template preview, desktop/mobile preview modes
- Global brand identity: name, logo, favicon
- Colors, typography, max width, section spacing, card/button radius
- Header layout, sticky header, search/account/cart controls
- Announcement bar
- Hero, featured products, collection list, rich text, newsletter sections
- Navigation editor with custom links and category links, plus nested dropdown parents
- Theme configuration stored in the database and rendered by the storefront

### Product editor
- Shopify-style multi-tab editor: General, Inventory, Shipping, Variants, Metafields, Search & SEO
- Title/description, media gallery and alt text
- Vendor/brand, product type, category, status, tags
- Price, compare-at price and cost/margin
- SKU, barcode, inventory tracking, reservations and locations
- Physical product, tax, gift card, shipping weight, template
- Up to three option dimensions in the editor and editable variants
- Custom metafield definitions and product metafield values
- Search title, description, SEO image, handle/URL
- Publishing channel controls and preview

### Admin operations
- Dedicated Online Store hub
- Navigation management
- Stronger Settings center with store details, payments, checkout, localization, notifications, security and custom data
- Order detail view with items, financial summary, timeline, fulfillment, tracking, payment and customer information
- Product list with status, inventory and quick access to the full editor

## v6 Theme Editor enhancements
- Shopify-style image banner media editor with desktop/mobile images, focal point, fit, overlay, content positioning, and live preview.
- Announcement bar can be positioned above or below the header and configured from Theme Studio.

## Theme Studio Pro v7

This version replaces the previous theme editor with a hardened, Shopify-style editing workspace focused on reliability and no-code control.

Highlights:
- Stable draft snapshot history with 50-step undo/redo.
- Debounced autosave after edits, plus explicit Save and Preview actions.
- Separate Content / Design / Motion inspector tabs.
- Section tree with add, hide/show, reorder, duplicate, and delete.
- Template switcher for Home, Product, Collection, Cart, Pages, Blog and catalog templates.
- Global theme system for brand, colors, typography, layout, buttons, cards and motion.
- Premium live canvas with desktop/tablet/mobile previews and section selection overlays.
- Banner media studio with desktop/mobile art direction, media library, focal-point controls and fit settings.
- Defensive media loading with graceful empty/error states.
- No side-effect fetching during render; media is loaded in `useEffect`.
- No nested interactive controls inside preview section wrappers.
- Responsive studio layout that collapses cleanly on narrower screens.

Theme Studio: `http://localhost:3000/admin/online-store/theme-editor`
