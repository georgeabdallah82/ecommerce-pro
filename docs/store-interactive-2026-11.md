# Pop-ups and small forms: focus, keys and labels (November 2026)

Branch `claude/store-interactive`, based on `origin/main` at 7bc687c (after #615).

No earlier round opened the storefront's pop-ups and small forms:
- the welcome offer
- a friend's invite
- the quick view
- the notifications prompt
- "Notify me when it's back"
- the review form
- the question form

For this round each was switched on locally and opened the way a shopper opens it, at 1280 and 390 px and in Arabic. The checks:
- what a screen reader is told it is
- where focus goes
- whether Tab stays inside
- whether Escape closes it
- whether focus comes back afterwards
- whether the page behind is locked
- axe, touch sizes and field font size

The photo zoom was the yardstick: it already did all of this. The local test data was removed afterwards: the offers, an invite code, a sold-out product, two sizes, a delivered order, and the number typed into the welcome offer.

New styles are in `app/storefront-interactive.css`, imported last. The keyboard rules are one shared hook, `components/use-modal-focus.ts`.

## What changed

1. **The modal pop-ups: the welcome offer, a friend's invite and the quick view.**
   - Before:
     - Opening one left focus on the page behind it.
     - Tab moved through the page, not the pop-up: every one of 14 presses stayed outside it.
     - Escape did nothing.
     - The page still scrolled behind it.
   - Now, as with the photo zoom:
     - Focus moves in when it opens: the number field of the welcome offer, "Start shopping" on an invite, the close button of the quick view.
     - Tab stays inside.
     - Escape closes it.
     - The page behind is locked.
     - Focus goes back to what had it, such as the card's "Choose options" button.
   - The two offers read their sentence with their title. Once the welcome code arrives, focus moves to it, so it is read out.
2. **The quick view.**
   - It had no name (axe: aria-dialog-name). It is named after the product.
   - Its sizes are a group, and the chosen one says so to screen readers (aria-pressed).
   - A sold-out size was labelled "Large (sold out)" while it shows "Large · Sold out" (axe: label-content-name-mismatch). It is now named by what it shows, so voice control finds it by those words.
   - The small "PRODUCT" label was 11 px on a cream pill (4.3:1). It is now plain 13 px dark grey, like the collection pages'.
3. **The review form.**
   - Its two fields had only placeholders, which disappear as you type. "Review title (optional)" and "Share details about your experience (optional)" are now their visible labels.
   - The stars only showed the chosen rating in colour. They are now a group named "Your rating", and the chosen star says so (aria-pressed).
   - An error ("Pick a star rating first.") is now read out.
   - The stars were meant to be 44 px on phones, but the rule found them by their English label ("… out of 5 stars"), so on the Arabic store they stayed 26 px. The rule now finds them by their class.
   - Its fields are 16 px on touch screens. At 14 px, iPhones zoom the page in on tap.
4. **Forms that take the place of the button that opened them.** "Notify me when it's back" and "Ask a question" replace their button with a form, so focus fell to the top of the page. It now moves to the email field and to the question.
5. **Touch sizes.**
   - The pop-ups' close buttons were 36 px (welcome and invite) and 40 px (quick view); they are now 44 px on touch screens.
   - The notifications prompt's "Not now" and "Yes, notify me" were 42 px, and its close button 30 px; all are now 44 px.
   - "Start shopping" in the offers is now a plain button rather than a submit button outside a form, and it keeps its look.

## Not changed, on purpose

- **The notifications prompt doesn't take focus.** It is a small box in the corner, not a modal, so it shouldn't interrupt. Its buttons are reachable with Tab and are now 44 px on touch screens.
- **A product card's "Add to cart" sits inside the card's link.** A button inside a link is not valid HTML, and screen readers handle it unevenly. Changing the cards is a larger change across every product grid, so it is left for its own round.
- **"Write a review" stays a link to the form**, as before. The form is always open on the page for a customer who can review.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass.
  - `npm test` runs 1194 tests; `tests/store-interactive.test.ts` adds 7.
  - One existing check (`tests/ux-sprint1.test.ts`) looked for the stars' old English-label rule. It now looks for the new one, with the same 44 px.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- Browser checks at 1280 and 390 px and in Arabic:
  - The welcome offer, the invite and the quick view:
    - Focus moves in.
    - None of 14 Tab presses leaves them.
    - Escape closes them, and focus returns to the opener.
    - The page is locked.
    - axe finds nothing, and no phone target is under 44 px.
  - The welcome offer, sent a test number: focus moves to the code, Escape closes it, and "Start shopping" keeps its 50 px red style.
  - "Notify me" and "Ask a question" put focus in their field (16 px).
  - The review form: labelled fields (16 px on phones), stars that say which is chosen, 44 px in both languages, and nothing from axe.
  - The notifications prompt doesn't take focus, axe finds nothing, and its buttons are 44 px on phones. The test browser blocks notifications, so it was told they were not decided yet.
  - The photo zoom behaves as before.
- UX audit of 9 pages at both widths: no axe violations, no phone tap target under 44 px, no text under 12 px, no sideways scroll.
- Crash sweep: 72 page loads, only the expected 404s, no 5xx and no page errors.
- The homepage motion checks (37) and the sticky header, focus and scroll-lock checks (10) still pass.
