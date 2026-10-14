# Yalla Haul Shopify theme — Market edition

This Shopify theme adapts the **current Yalla Haul storefront design** to Shopify's native theme architecture. It is based on Dawn 16.0.0 so Shopify continues to manage products, variants, search, customer accounts, cart and checkout.

## Visual direction

The Market edition follows the live site's red navigation, white delivery-area bar and category navigation, large photo-led hero slider, home/personal-care offer banners, category circles, product tabs, product rail, trust strip, and dark footer with WhatsApp help band. Core brand styling uses red `#D7261E`, warm near-white `#F6F6F4`, white cards, near-black text, and DM Sans.

The previous Bento sections remain in the repository for reference, but the homepage and global header/footer now use the Market edition sections.

## Main custom sections

| File | Purpose |
| --- | --- |
| `sections/yh-market-header.liquid` | Red responsive header, search, account/cart, area picker, category links and mobile drawer |
| `sections/yh-market-hero.liquid` | Full-width photo slider with mobile-friendly layout and editable calls to action |
| `sections/yh-market-offers.liquid` | Image offer cards for Home, Personal Care and other campaigns |
| `sections/yh-market-categories.liquid` | Collection-category circles |
| `sections/yh-market-product-tabs.liquid` | Product tabs, including an optional sale-items tab |
| `sections/yh-market-product-rail.liquid` | Horizontal featured/best-seller product rail |
| `sections/yh-market-spotlight.liquid` | Editorial image + copy collection spotlight |
| `sections/yh-market-trust.liquid` | Delivery, COD, returns and support messages |
| `sections/yh-market-footer.liquid` | Dark footer, newsletter sign-up, policy/menu links, and WhatsApp help band |
| `assets/yh-market.css`, `assets/yh-market.js` | Responsive Market styling, hero slider, tabs, mobile menu and saved delivery area |

Product tiles reuse the Shopify-native `snippets/yh-card.liquid` component and product forms. Product and collection links are Shopify routes/objects; add-to-cart and checkout are not simulated.

## Upload to Shopify

1. In Shopify admin, open **Online Store → Themes**.
2. Choose **Add theme → Upload zip file**.
3. Upload the packaged theme ZIP (the ZIP root must contain `assets/`, `config/`, `layout/`, `locales/`, `sections/`, `snippets/`, and `templates/`).
4. Preview before publishing. Set the shop logo, social links, WhatsApp number, Main menu and choose the actual collections in **Customize**.

Products are separate from theme code. The CSV in `../shopify-import/products.csv` is only an optional import starting point; verify product details, inventory, prices, images and policies before importing or publishing.

## Important

Shopify checkout, payment methods, shipping/delivery rates, domain settings, taxes and legal policies must be configured in Shopify admin. The delivery-area picker is a visual/storefront preference only; it does **not** calculate shipping rates or automatically alter the checkout address. Keep the existing Yalla Haul site unchanged until you have previewed and tested the Shopify store.
