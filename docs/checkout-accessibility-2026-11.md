# Checkout accessibility review (2026-11)

Closes the backlog item "the checkout's labels and error association for assistive technology were not reviewed in depth" in `docs/storefront-checkout-audit-2026-11.md`.

## Method

- axe-core 4 run in the browser on the checkout (local production build, scratch database; nothing ordered). Four states: desktop initial, after an empty submit (errors shown), gift-card field open, and a 390 px phone.
- The Tab order was read from the DOM and checked against the screen layout.
- The skip link was activated from the keyboard.

## Results

- Before: two findings in every state. The skip link was fourth in the Tab order, after the cookie banner, and its target `#main-content` did not exist until it was clicked. The announcement bar sat outside every landmark.
- After: zero axe violations in all four states. The skip link is the first keyboard stop, and activating it moves focus into `<main>`.

## Changed

- `app/layout.tsx`: the cookie banner comes after the skip link. A `#main-content` target sits before the page content, so the skip link resolves without JavaScript.
- `components/skip-link.tsx`: no longer creates the target at click time.
- `components/store-nav-fixed.tsx`: the announcement bar is a labelled region (`role="region"`). The Arabic label is in `lib/i18n-ar.ts`.
- `tests/storefront-a11y.test.ts`: pins the three changes.

## Open, not changed

- **Order summary and focus order.** On desktop (960 px and up) the order summary sits to the right of the form but comes first in the DOM. The discount-code control is therefore the third keyboard stop, before the contact fields. On phones the summary sits above the form, so its DOM order matches. Fixing the desktop order means moving the summary after the form, which changes the phone layout. That is a product decision.

## Not verified

- Screen-reader output. The names and landmarks were checked with axe and in the DOM, not with a screen reader.
