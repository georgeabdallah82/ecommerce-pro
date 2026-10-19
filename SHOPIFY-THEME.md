# Yalla Haul Shopify Theme — Merchant Editable Edition

The current uploadable Shopify Online Store 2.0 package is version **3.0.1**. It follows Yalla Haul's actual brand guidelines and exposes global brand controls plus section and block settings in Shopify's Theme Editor.

## Brand system
- Yalla Red: `#D7261E`
- Haul Orange: `#FF7A1A`
- Ink: `#121212`
- Page Grey: `#F6F6F4`
- White: `#FFFFFF`
- Blush: `#FDECEA`
- Line: `#ECECEC`
- DM Sans for headings/body; IBM Plex Sans Arabic option
- 46px sentence-case buttons, 10px button corners, 14px cards, no gradients

## What can be edited
Global Theme settings include logo variants, footer logo, brand icon/favicon/social image, brand colors, fonts, content width/spacing, card/button shapes, icon stroke, labels, product-card behavior, and social/contact links. Section settings and blocks control the header, announcement ticker, hero slides, category collections, featured collection tabs, banners, image/text sections, text, newsletter and footer. The Theme Editor also supports adding/removing/reordering sections, plus reusable icon promises, content cards and Custom Liquid.

## Version 3.0.1 correction
The homepage Image with text section had a saved `gap` value of `42px` while its schema only accepts 4px increments from a 16px minimum. That was invalid theme configuration data. The ZIP was corrected to `40px`, the version was bumped to 3.0.1, and an automated structural validation checked JSON, section schemas, referenced section and block types, all section/block order arrays, option choices, numeric ranges, snippets and required root-level theme files.

## Package and installation
The complete uploadable `yalla-haul-shopify-theme.zip` was saved in the user's Library at `/Business/Yalla Haul/yalla-haul-shopify-theme.zip`. This GitHub branch holds documentation and selected source references, not the complete binary image package.

Upload through Shopify Admin → Online Store → Themes → Add theme → Upload zip file. Keep it unpublished while editing and testing. Upload the approved light/dark/icon logo variants under Theme settings → Brand & logos, then assign real collections and replace starter images.

The existing Next.js site, main branch, database and domain are not changed or migrated by the ZIP. Shopify Theme Check and an actual storefront preview still need to be run within Shopify after upload.

## If preview still shows “Page not found”
The package includes `layout/theme.liquid`, `config/settings_schema.json`, `config/settings_data.json`, and `templates/index.json` at ZIP root. Preview it using Online Store → Themes → this draft theme → ⋯ → Preview. Do not use `yallahaul.com` for verification until the domain is connected to Shopify; the custom domain may still route to the previous host. If the draft preview itself returns 404, open Edit code and confirm `templates/index.json` exists after import; if absent, inspect Shopify's import error details before publishing.
