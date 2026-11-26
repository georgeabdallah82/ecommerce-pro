# Theme editor and the live shop: every page, and Theme settings (November 2026)

Branch `claude/theme-front-parity`, based on `origin/main` at 0d38f89. Earlier rounds: `docs/theme-studio-bugs-2026-11.md`, `docs/theme-studio-audit-2-2026-11.md`.

## How it was checked

In a production build, signed in as the local admin:

- **Page templates:**
  - Two marked sections (Rich text and Testimonials) were added in the editor to each template: Product, Collection & shop, Cart, Blog and a custom page.
  - The theme was published, and every heading of the preview was compared with the live page at 1280 px and 390 px: what shows, and where the added sections sit.
- **Theme settings:** a theme with ten store-wide changes was published:
  - colours;
  - heading and body fonts;
  - button corners, case and height;
  - card corners;
  - brand-colour header, no category tabs;
  - no Add to cart and a different line on product cards;
  - page width and section spacing;
  - delivery bar off.
- **Compared on Home, Product, Shop and Cart at both widths:** the computed styles of the page, header, headings, buttons, cards and page width, in the preview and on the live shop.

The added sections showed in the same place on every live page, at both widths. The preview and the live shop now draw the same.

## Fixed

- **Four Theme settings did nothing on the market storefront.** The preview and the live shop agreed, but neither followed the setting. Its own styles had fixed values:
  - **Typography › Heading font:** headlines were always Bricolage Grotesque.
    - Bricolage stays while the heading font is the market default (DM Sans).
    - Another chosen font is used for headlines too (`lib/font-options.ts` `marketDisplayFace`, `--store-display-face` in `app/layout.tsx` and the preview).
  - **Buttons › corner radius, uppercase, height:** the market's buttons had 10 px corners, normal case and 46 px. They now follow the setting; the card's Add to cart keeps its own height.
  - **Layout › Max page width:** the market's page box was always 1328 px. It is now the setting minus 32 px.
  - **Layout › Section spacing:** the gaps between sections were always 40 px (phones) and 64 px (computers). They now scale with the setting.
  - The market defaults (DM Sans, 10 px, normal case, 46 px, 1360 px, 76 px) give exactly the old values. Measured before and after with the store's own theme: headline font, page width, gaps and buttons are identical.
- **The Shop page preview listed the products in another order.** The live Shop page sorts newest first; the preview used the editor's list, featured first. It now sorts like the live page (`components/theme-preview-frame.tsx`).

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- `tests/theme-front-parity.test.ts` adds 3 tests.
- **Theme with the ten changes, after the fix:**
  - preview and live are the same on Home, Product, Shop and Cart at both widths;
  - headlines in the chosen serif font;
  - buttons square, uppercase, 58 px;
  - page box 968 px (1000 setting);
  - section gap 128 px (152 setting).
