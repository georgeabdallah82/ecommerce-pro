# Yalla Haul Shopify theme

Yalla Haul's Shopify theme, "Deals Market": a red marketplace header, flash-deals banner and
deal cards in the logo's colours, built on [Dawn](https://github.com/Shopify/dawn) 16.0.0. Dawn
keeps the cart, checkout hand-off, product page, filters, search and customer accounts; the
Yalla Haul parts are the `yh-*` files.

| File | What it is |
| --- | --- |
| `sections/yh-header.liquid` | Red header: white logo, search with an orange button, Account and Cart (sticky) |
| `sections/yh-subnav.liquid` | Darker red row of category tabs ("All" first) |
| `sections/yh-flash.liquid` | Black "Flash deals" banner with a countdown, plus a coupon card and a photo tile |
| `sections/yh-categories.liquid` | Round category photos in a white panel, with "Flash deals" and "All" circles |
| `sections/yh-products.liquid` | "Today's best deals" product grid in a white panel, optional countdown |
| `sections/yh-trust.liquid` | Four reasons-to-buy cards with red icons |
| `sections/yh-help.liquid` | "Need help with your order?" WhatsApp card (off on the home page by default) |
| `sections/yh-footer.liquid` | Black footer: logo, social links, link columns, newsletter |
| `sections/yh-breadcrumbs.liquid` | Breadcrumbs on product and collection pages |
| `sections/cart-icon-bubble.liquid` | Cart button contents (re-rendered by the cart drawer) |
| `snippets/yh-card.liquid` | Deal card (ribbon, red price, "Cash on delivery", black "Add to cart"), also on collection, search and related products |
| `snippets/yh-tabbar.liquid` | Optional phone bottom bar: Home, Categories, Cart, Account (off by default) |
| `snippets/yh-photo.liquid` | Uploaded photo or one of the built-in `assets/yh-*.jpg` photos |
| `snippets/yh-icon.liquid`, `snippets/yh-whatsapp-float.liquid` | Icons, floating WhatsApp button |
| `assets/yallahaul.css`, `assets/yallahaul.js` | Styles and behaviour (countdown to midnight, bottom bar) |

Brand colours (logo red #D42A2A, orange #FF7A1A, black #171717, cream #FFF1E6), corners, the
card note, WhatsApp and the phone bottom bar are under **Theme settings > Yalla Haul**. The page
background is Colors > Scheme 1 (#F6F4F2); panels, cards and the cart drawer use Scheme 2
(white). Font: Figtree. The logo and favicon are uploaded in the theme editor (Theme settings >
Logo; the footer has its own logo for dark backgrounds); until then the store name is shown.
Built-in photos are Unsplash (free for commercial use), see `public/stock/CREDITS.txt`.

## Install

Zip the theme folders (not this README) and upload under Online Store > Themes > Add theme >
Upload zip file:

    cd shopify-theme && zip -r ../yalla-haul-theme.zip assets config layout locales sections snippets templates

Check before uploading: `@shopify/theme-check-node` should report no errors.

Products to import are in `../shopify-import/products.csv` (Products > Import).
