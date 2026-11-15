# Admin › Customers (November 2026)

Branch `claude/admin-customers`, based on `origin/main` at 8a8fa75 (after #629).

## What was wrong

- **The list:**
  - "Add customer" opened as an overlay that wasn't a dialog. It had no dialog role or name, Tab walked into the page behind it, and Escape did nothing.
  - The last column had an empty header.
- **A customer's page:**
  - It had a second `<main>` inside the admin layout's.
  - The "Add to a segment" picker had no name. axe reported `select-name` at both widths.

## What changed

- **`components/customers-admin.tsx`:**
  - "Add customer" is a dialog named by its heading and uses the shared `useModalFocus`: focus starts in the name box, Tab stays inside, and Escape closes it and returns to the button.
  - The actions column is named for screen readers.
- **`components/customer-detail-admin.tsx`:** the nested `<main>` is a `<div>`, and the segment picker is named "Segment to add this customer to".
- **`components/admin-ui.module.css`:** a shared `srOnly` style.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-customers.test.ts` adds 2 tests.
- `npm run build:cloudflare` with the CI environment passes.
- **6 browser checks pass on the production build:**
  - axe finds nothing on the list or a customer's page, on a computer and a phone;
  - each page has one `<main>` and no sideways scroll;
  - Add customer works as a dialog from the keyboard;
  - no page errors.
- Nothing was saved.
