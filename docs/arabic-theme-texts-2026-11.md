# Arabic texts typed with the English left empty (November 2026)

Branch `claude/theme-front-parity-2`, based on `origin/main` at e8d6a07.

## Found

The check: with Arabic switched on, an Arabic text was typed into every Arabic box of Theme settings (10 boxes) in the editor's Arabic mode, and published. The marks were then looked for in:

- the Arabic preview;
- the live Arabic shop (homepage at both widths, a product, the cart);
- the live English shop.

Five worked everywhere and never leaked into English:

- brand name;
- delivery bar note;
- product card line;
- footer text;
- shipping text (read through the same lookup).

The WhatsApp texts need the button switched on.

Three were missing in both the preview and the live Arabic shop:

- **Header › Search box hint**;
- **Delivery bar › Label**;
- **Delivery bar › Time label**.

The cause: `localize` (`lib/i18n.ts`), which makes the Arabic store's theme and sections, only looked for an Arabic version of keys that had an English value. These boxes are usually left empty in English, so the store shows its standard English (with its standard Arabic translation). An Arabic text typed next to an empty English box was therefore never used.

This is not limited to Theme settings: any section text left empty in English had the same problem.

## Fixed

An Arabic text is now used whenever it is filled in and the English box is empty. The English store is unchanged.

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- `tests/i18n.test.ts` adds 1 test.
- **The same browser check after the fix:** the search hint, the delivery label and the time label show in the Arabic preview and the live Arabic shop, and not in the English shop.
