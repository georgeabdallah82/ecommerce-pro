# Yalla Haul Market: Shopify theme

A Shopify Online Store 2.0 theme that copies the look and the theme-editor setup of the current
storefront. It is built as a theme only: products, orders, customers and the admin tools stay where
they are until you decide to move the store (see "Not covered yet").

## What is in the theme

| Area | Files | What the theme editor controls |
| --- | --- | --- |
| Look | `config/settings_schema.json`, `assets/theme.css` | Colours, DM Sans fonts, weights, text size, line height, spacing, widths, button and card styling, header and motion options |
| Site-wide | `sections/header.liquid`, `announcement-bar.liquid`, `delivery-bar.liquid`, `footer.liquid` | Menus, announcement messages, delivery areas and times, footer columns and newsletter, social links |
| Home page | `templates/index.json` and 14 sections | Hero slider, offer banners, category strip, product tabs (deals, best sellers, new), product row, category spotlight, shop by price, trust strip, recently viewed, rich text, FAQ, testimonials, newsletter, image with text |
| Product page | `sections/main-product.liquid` | Gallery and thumbnails, options, quantity, add to cart, sticky add to cart on phones, stock warning, delivery text, related products |
| Collection page | `sections/main-collection.liquid` | Shopify filters, sorting, pagination, products per page |
| Cart | `sections/main-cart.liquid`, `snippets/cart-drawer.liquid` | Cart drawer and cart page, order note, free-delivery progress bar |
| Search, pages, 404 | `main-search.liquid`, `main-page.liquid`, `not-found.liquid` | Results per page |
| Extras | `snippets/whatsapp-float.liquid`, `social-meta-tags.liquid` | Floating WhatsApp button, Open Graph tags for shared links |
| Brand assets | `assets/yallahaul-logo.svg`, `assets/*.jpg` | Your logo (header, footer, browser icon) and the brand photos used until you upload your own. Upload a logo in the theme editor to replace the header and footer logo |
| Language | `locales/en.default.json`, `locales/ar.json` | All interface text in English and Arabic (Arabic switches the page to right-to-left) |

## Set it up (run these on your own computer)

You need Node.js and the Shopify CLI. The theme needs no build step.

```bash
npm install -g @shopify/cli@latest
cd shopify-theme
shopify theme check                                   # validates the theme (no errors expected)
shopify theme login --store YOUR-STORE.myshopify.com  # you log in in the browser
shopify theme dev --store YOUR-STORE.myshopify.com    # live preview while you edit
shopify theme push --unpublished                      # uploads a copy you can review before publishing
```

Never paste passwords, API keys or access tokens into a chat or into these files. The CLI keeps
your login on your computer.

### First-time settings in Shopify admin

1. **Navigation**: create menus with these handles: `main-menu` (header), `footer` and
   `customer-service` (footer columns).
2. **Collections**: create `Deals`, `Best sellers` and `New arrivals`, and pick them in the
   product tabs section on the home page. Pick a collection for each category in "Shop by category".
3. **Home page**: replace the placeholder photos in the hero slider and offer banners.
4. **Theme settings**: set the logo, the delivery areas and times (Delivery bar), the WhatsApp
   number, and your social links.
5. **Policies**: privacy, refund and terms pages (the footer links to them automatically).

## Not covered yet (needs a decision or an app)

The current site has features that Shopify does not provide in the theme itself. Each one needs an
app, a Shopify Function, or custom code. Listed so nothing is lost by surprise:

- **Ordering on WhatsApp** (the "Send my order on WhatsApp" button on the thank-you page, and the
  WhatsApp order board). Checkout pages cannot be changed in a theme.
- **Quantity deals** ("Buy 2 save 10%", "3 for $20"): a discount app or Shopify discount rules.
- **Influencer codes, reward codes and store credit**: apps or Shopify discounts.
- **Delivery area pre-filled at checkout**: the bar shows the area and time, but checkout uses
  Shopify's shipping zones and cannot read the bar's choice.
- **Reviews, wishlist, back-in-stock alerts, product questions, frequently bought together**:
  these need review, wishlist or notification apps.
- **Admin tools**: drivers, delivery sheets, profit dashboard, ad spend, visitor stats and the
  launch tools stay in the current site's admin.
- **Meta pixel and conversions API**: use Shopify's Meta channel app, not the theme.
- **Some storefront sections** from the current theme are not built yet: the full collection-grid
  and multi-column layouts, the promo grid, logo list, stats, video, social grid and countdown.
- **Mega menu**: the header shows a flat menu from the Main menu.
- **Arabic product content**: the theme translates the interface. Product descriptions and
  collection names are translated in Shopify Markets.
- **Maintenance mode**: use Shopify's password page while the store is closed.

## Checking it

- `shopify theme check` runs Shopify's own validator. It passes with no errors or warnings.
- Visual comparison with the current site can only be done in a browser once the theme is
  previewed against a real store (`shopify theme dev`). This has not been done yet.
