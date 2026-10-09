# Yalla Haul Shopify theme

The store's look (the "market" design of the old Next.js storefront) as a Shopify theme, built on
[Dawn](https://github.com/Shopify/dawn) 16.0.0. Dawn keeps the cart, checkout hand-off, product
page, filters, search and customer accounts; the Yalla Haul parts are the `yh-*` files.

| File | What it is |
| --- | --- |
| `sections/yh-header.liquid` | Logo, search bar, account and cart buttons, phone side menu (sticky) |
| `sections/yh-subheader.liquid` | Delivery bar (area picker) and category tabs with the "All categories" panel |
| `sections/yh-hero.liquid` | Full-width photo slider |
| `sections/yh-offers.liquid` | One to three photo banners |
| `sections/yh-categories.liquid` | "Shop by category" circles |
| `sections/yh-spotlight.liquid` | A collection's products next to a photo banner |
| `sections/yh-products.liquid` | A row of product cards |
| `sections/yh-trust.liquid` | Reasons to buy |
| `sections/yh-help-bar.liquid`, `sections/yh-footer.liquid` | Red WhatsApp band and the dark footer |
| `sections/yh-breadcrumbs.liquid` | Breadcrumbs on product and collection pages |
| `sections/cart-icon-bubble.liquid` | Cart button contents (re-rendered by the cart drawer) |
| `snippets/yh-card.liquid` | Product card, also used on collection, search and related products |
| `snippets/yh-photo.liquid` | Uploaded photo or one of the built-in `assets/yh-*.jpg` photos |
| `snippets/yh-icon.liquid`, `snippets/yh-whatsapp-float.liquid` | Icons, floating WhatsApp button |
| `assets/yallahaul.css`, `assets/yallahaul.js` | Styles and behaviour (slider, menu, panel, area picker) |

Brand colours, corners, delivery areas, the card note and WhatsApp are under **Theme settings >
Yalla Haul**. Built-in photos are Unsplash (free for commercial use), see `public/stock/CREDITS.txt`.

## Install

Zip the theme folders (not this README) and upload under Online Store > Themes > Add theme >
Upload zip file:

    cd shopify-theme && zip -r ../yalla-haul-theme.zip assets config layout locales sections snippets templates

Check before uploading: `@shopify/theme-check-node` should report no errors.

Products to import are in `../shopify-import/products.csv` (Products > Import).
