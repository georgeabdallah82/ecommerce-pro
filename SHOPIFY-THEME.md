# Yalla Haul Shopify Theme

This theme is a Shopify Online Store 2.0 adaptation of the existing Yalla Haul storefront direction: light neutral backgrounds, white surfaces, dark typography, a charcoal announcement bar, red primary actions, orange accent details, large lifestyle imagery, collection-led discovery and responsive product cards.

## Deliverable
The complete uploadable theme is provided as `yalla-haul-shopify-theme.zip` in the ChatGPT delivery. It includes the full Liquid sections, templates, snippets, settings and responsive assets. This repository folder contains the core source reference used for review and iteration.

## Installation
1. Shopify Admin → Online Store → Themes.
2. Choose Add theme → Upload zip file and upload the provided ZIP.
3. Preview the theme before publishing; do not publish until you have checked it on mobile and desktop.
4. Upload the approved Yalla Haul logo in Theme settings, select the correct homepage hero and collection images, then configure navigation.
5. Add/import Shopify products, variants, stock, shipping zones, cash-on-delivery instructions, store policies and notifications.

## Important migration note
The theme is a storefront, not a migration tool. The existing Next.js database, admin panel, customers, orders, media, coupons, inventory rules and integrations do not automatically migrate into Shopify. Import products separately and test all order/shipping/payment flows before switching the domain. Keep the existing website and DNS unchanged until the Shopify preview is approved.

## Initial art direction
- Page background: `#F6F6F4`
- Surface: `#FFFFFF`
- Text: `#121212`
- Primary: `#D7261E`
- Accent: `#FF7A1A`
- Muted text: `#6B7280`
- Content width: 1240 px
- Product cards: 14 px corners; buttons: 10 px corners
- Tagline placeholder: “Small finds. Big delight.” — editable in settings
