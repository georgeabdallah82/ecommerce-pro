import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'

// Pop-ups and small forms (docs/store-interactive-2026-11.md): the welcome offer, a friend's invite, the quick view,
// the notifications prompt, "Notify me when it's back", the review form and the question form.

const read = (path: string) => readFileSync(path, 'utf8')

test('one set of keyboard rules for the modal pop-ups, the ones the photo zoom follows', () => {
  const hook = read('components/use-modal-focus.ts')
  // Focus moves in: to [data-autofocus], else the first control.
  assert.match(hook, /\(dialog\.querySelector<HTMLElement>\('\[data-autofocus\]'\) \|\| controls\(\)\[0\] \|\| dialog\)\.focus\(\)/)
  // Escape closes; Tab and Shift+Tab wrap around inside.
  assert.match(hook, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\.current\(\); return \}/)
  assert.match(hook, /if \(e\.shiftKey && at <= 0\) \{ e\.preventDefault\(\); list\[list\.length - 1\]\.focus\(\) \}/)
  assert.match(hook, /else if \(!e\.shiftKey && \(at === -1 \|\| at === list\.length - 1\)\) \{ e\.preventDefault\(\); list\[0\]\.focus\(\) \}/)
  // The page behind is locked, and focus goes back to what had it.
  assert.match(hook, /root\.style\.overflow = 'hidden'/)
  assert.match(hook, /if \(opener && opener\.isConnected && opener !== document\.body\) opener\.focus\(\)/)
})

test('the quick view: named after the product, with the modal rules and sizes that say which is chosen', () => {
  const quick = read('components/storefront-sections.tsx')
  assert.match(quick, /useModalFocus\(dialogRef,true,onClose\);/)
  assert.match(quick, /<div ref=\{dialogRef\} className="focalModal" role="dialog" aria-modal="true" aria-labelledby=\{titleId\} tabIndex=\{-1\} onClick=\{onClose\}>/)
  assert.match(quick, /<h2 id=\{titleId\}>\{product\.name\}<\/h2>/)
  assert.match(quick, /<div className="focalVariantList" role="group" aria-label=\{t\('Options'\)\}>/)
  assert.match(quick, /<button key=\{v\.id\} type="button" aria-pressed=\{variantId===v\.id\}/)
  // A sold-out option is named by its own words ("Large · Sold out"); the label "Large (sold out)" did not match them.
  assert.doesNotMatch(quick, /aria-label=\{v\.available===0\?t\('\{name\} \(sold out\)'/)
})

test('the welcome offer and a friend\'s invite: focus moves in, stays, and Escape closes them', () => {
  const welcome = read('components/welcome-popup.tsx')
  assert.match(welcome, /useModalFocus\(dialogRef, open && !!welcome, close\)/)
  assert.match(welcome, /aria-labelledby="welcome-title" aria-describedby="welcome-text" tabIndex=\{-1\}/)
  assert.match(welcome, /<input data-autofocus type="tel"/)
  // Once the code is there, focus moves to it, so it is read out.
  assert.match(welcome, /useEffect\(\(\) => \{ if \(code\) codeRef\.current\?\.focus\(\) \}, \[code\]\)/)
  const invite = read('components/invite-landing.tsx')
  assert.match(invite, /useModalFocus\(dialogRef, !!invite, close\)\n\s+if \(!invite\) return null/, 'the hook runs before the early return')
  assert.match(invite, /<button data-autofocus type="button" className="welcomeStart" onClick=\{close\}>/)
  // "Start shopping" is a plain button now; it keeps the pop-up's primary look.
  assert.match(read('app/storefront-selling.css'), /\.welcomeCard button\[type=submit\], \.welcomeCard \.welcomeStart \{/)
})

test('the review form: labelled fields, a named group of stars that says which is chosen, and errors read out', () => {
  const pdp = read('components/aliexpress-product.tsx')
  assert.match(pdp, /<div className="aliReviewStarPicker" role="group" aria-labelledby=\{ratingLabelId\}/)
  assert.match(pdp, /<button key=\{n\} type="button" aria-pressed=\{rating === n\} aria-label=\{t\('\{n\} out of 5 stars', \{ n \}\)\}/)
  assert.match(pdp, /<label className="aliReviewFormField"><span className="aliReviewFormLabel">\{t\('Review title \(optional\)'\)\}<\/span>/)
  assert.match(pdp, /<label className="aliReviewFormField"><span className="aliReviewFormLabel">\{t\('Share details about your experience \(optional\)'\)\}<\/span>/)
  assert.match(pdp, /\{error && <p className="aliReviewFormError" role="alert">\{error\}<\/p>\}/)
  for (const text of ['Review title (optional)', 'Share details about your experience (optional)', 'Your rating']) assert.ok(AR[text], text)
})

test('a form that replaces the button that opened it takes the focus', () => {
  assert.match(read('components/back-in-stock-button.tsx'), /<input autoFocus type="email" required/)
  assert.match(read('components/product-questions.tsx'), /<textarea autoFocus rows=\{3\}/)
})

test('touch sizes, readable fields and no style that depends on an English label', () => {
  const css = read('app/storefront-interactive.css')
  assert.match(css, /html body \.welcomeClose \{ width: 44px; height: 44px; \}/)
  assert.match(css, /html body \.focalStorefront \.focalQuickClose, html body \.focalQuickClose \{ width: 44px; height: 44px; \}/)
  assert.match(css, /@media \(pointer: coarse\) \{ html body \.aliReviewFormInput \{ font-size: 16px; \} \}/)
  assert.match(css, /html body \.focalQuickInfo \.focalEyebrow \{[^}]*font-size: 13px !important;/)
  assert.match(read('components/push-opt-in.module.css'), /@media \(pointer: coarse\) \{\n\s+\.primary, \.secondary \{ min-height: 44px; \}\n\s+\.close \{ width: 44px; height: 44px; \}/)
  // The stars were found by "... out of 5 stars", which missed them in Arabic.
  assert.match(read('app/storefront-market.css'), /html body\.mk \.aliProductPage \.aliReviewStarPicker button \{ min-width: 44px; min-height: 44px; \}/)
  for (const file of readdirSync('app').filter(f => f.endsWith('.css'))) assert.doesNotMatch(read(`app/${file}`), /\[aria-label[$^*]?=/, file)
})

test('the pop-up styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-interactive.css'") > layout.indexOf("import './storefront-real.css'"))
})
