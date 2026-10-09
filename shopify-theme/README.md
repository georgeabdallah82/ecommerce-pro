# Yalla Haul Shopify theme

Yalla Haul's Shopify theme, "Bento": a white rounded top bar and nav bar, colourful rounded tiles
on a warm cream page, white product cards with a round "+" button, and a black footer with the
store name in big letters, in the logo's colours. Built on [Dawn](https://github.com/Shopify/dawn)
16.0.0: Dawn keeps the cart, checkout hand-off, product page, filters, search and customer
accounts; the Yalla Haul parts are the `yh-*` files.

| File | What it is |
| --- | --- |
| `sections/yh-header.liquid` | Top bar (logo, search, account, cart) and nav bar (Home, Shop all, Flash deals, menu, WhatsApp), sticky |
| `sections/yh-hero.liquid` | Optional hero banner: photo behind the text or a colour panel beside it, two buttons (hidden on the home page by default) |
| `sections/yh-bento.liquid` | Home page tiles: welcome, flash deal with countdown, notes, photos, WhatsApp; each small, wide, tall or big |
| `sections/yh-products.liquid` | "Popular right now": category chips and a product grid, optional countdown |
| `sections/yh-trust.liquid` | Four reasons-to-buy cards with icons (off on the home page by default) |
| `sections/yh-help.liquid` | "Need help with your order?" WhatsApp card (off on the home page by default) |
| `sections/yh-footer.liquid` | Black footer: logo, social links, link columns, newsletter, big store name |
| `sections/yh-breadcrumbs.liquid` | Breadcrumbs on product and collection pages |
| `sections/cart-icon-bubble.liquid` | Cart button contents (re-rendered by the cart drawer) |
| `snippets/yh-card.liquid` | Product card (orange discount label, price, round "+" button), also on collection, search and related products |
| `snippets/yh-tabbar.liquid` | Optional phone bottom bar: Home, Categories, Cart, Account (off by default) |
| `snippets/yh-photo.liquid` | Uploaded photo or one of the built-in `assets/yh-*.jpg` photos |
| `snippets/yh-icon.liquid`, `snippets/yh-whatsapp-float.liquid` | Icons, floating WhatsApp button |
| `snippets/yh-var.liquid` | Writes one section colour as a CSS variable (skipped when empty) |
| `assets/yallahaul.css`, `assets/yallahaul.js` | Styles and behaviour (countdown to midnight, bottom bar) |

Every Yalla Haul section has its own **Colours** settings (header and nav bar, each bento tile,
products, trust cards, help card, footer), so each part's colours are
changed by clicking it in the theme editor; `snippets/yh-var.liquid` passes them to the CSS.
Product-card colours (prices, discount label, "+" button), brand colours used by the Dawn pages
(logo red #D42A2A, orange #FF7A1A, black #171717, cream #FFF1E6), corners, the card note,
WhatsApp and the phone bottom bar are under **Theme settings > Yalla Haul**. The page
background is Colors > Scheme 1 (#FBF6F1); panels, cards and the cart drawer use Scheme 2
(white). Font: Outfit. The logo and favicon are uploaded in the theme editor (Theme settings >
Logo; the footer has its own logo for dark backgrounds); until then the store name is shown.
Built-in photos are Unsplash (free for commercial use), see `public/stock/CREDITS.txt`.

## Install

Zip the theme folders (not this README) and upload under Online Store > Themes > Add theme >
Upload zip file:

    cd shopify-theme && zip -r ../yalla-haul-theme.zip assets config layout locales sections snippets templates

Check before uploading: `@shopify/theme-check-node` should report no errors.

Products to import are in `../shopify-import/products.csv` (Products > Import).
