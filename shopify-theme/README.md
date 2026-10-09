# Yalla Haul Shopify theme

Yalla Haul's Shopify theme: an app-style look (like a delivery app) in the logo's colours, built on
[Dawn](https://github.com/Shopify/dawn) 16.0.0. Dawn keeps the cart, checkout hand-off, product
page, filters, search and customer accounts; the Yalla Haul parts are the `yh-*` files.

| File | What it is |
| --- | --- |
| `sections/yh-header.liquid` | Logo, "Deliver to" area picker, search, account and cart (sticky) |
| `sections/yh-promo.liquid` | Big dark banner (carousel) with two photo tiles |
| `sections/yh-categories.liquid` | Square category tiles and a "Deals" tile |
| `sections/yh-products.liquid` | Product row ("Today's deals") with an optional countdown to midnight |
| `sections/yh-trust.liquid` | Four reasons-to-buy cards with icons |
| `sections/yh-help.liquid` | "Need help with your order?" WhatsApp card |
| `sections/yh-footer.liquid` | Black footer: logo, social links, link columns, newsletter |
| `sections/yh-breadcrumbs.liquid` | Breadcrumbs on product and collection pages |
| `sections/cart-icon-bubble.liquid` | Cart button contents (re-rendered by the cart drawer) |
| `snippets/yh-card.liquid` | Product card with the "+" add button, also used on collection, search and related products |
| `snippets/yh-tabbar.liquid` | Phone bottom bar: Home, Categories, Cart, Account |
| `snippets/yh-photo.liquid` | Uploaded photo or one of the built-in `assets/yh-*.jpg` photos |
| `snippets/yh-icon.liquid`, `snippets/yh-whatsapp-float.liquid` | Icons, floating WhatsApp button |
| `assets/yallahaul.css`, `assets/yallahaul.js` | Styles and behaviour (banner slider, countdown, area picker, bottom bar) |

Brand colours (logo red #D42A2A, orange #FF7A1A, black #171717, cream #FFF4EC), corners, delivery
areas, the card note, WhatsApp and the phone bottom bar are under **Theme settings >
Yalla Haul**. Built-in photos are Unsplash (free for commercial use), see `public/stock/CREDITS.txt`.

## Install

Zip the theme folders (not this README) and upload under Online Store > Themes > Add theme >
Upload zip file:

    cd shopify-theme && zip -r ../yalla-haul-theme.zip assets config layout locales sections snippets templates

Check before uploading: `@shopify/theme-check-node` should report no errors.

Products to import are in `../shopify-import/products.csv` (Products > Import).
