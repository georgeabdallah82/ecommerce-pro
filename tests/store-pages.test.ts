import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'

// Store pages (docs/store-pages-2026-11.md): signing up and getting back in, the checkout's pinned button on phones,
// the policies and the stores page.

const read = (path: string) => readFileSync(path, 'utf8')

// WCAG relative luminance and contrast.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

test('create account is the sign-in page\'s card, with a visible label for every field', () => {
  const page = read('app/account/register/page.tsx')
  // The same shell, photo panel and perks as app/account/login/page.tsx.
  assert.match(page, /getThemeState\(\)\.then\(state => firstHeroPhoto\(state\.sections\)\)\.catch\(\(\) => null\)/)
  assert.match(page, /<div className=\{photo \? 'authShell hasPhoto' : 'authShell'\}>/)
  assert.match(page, /<li><Package size=\{18\} aria-hidden="true" \/>\{t\('Track every order'\)\}<\/li>/)
  // Labels, not placeholders, and the browser told what each field is (it can offer a strong password).
  assert.doesNotMatch(page, /placeholder=\{t\('Full name'\)\}|placeholder=\{t\('Password \(8\+ characters\)'\)\}/)
  assert.match(page, /<label className="fieldLabel" htmlFor="name">\{t\('Full name'\)\}<\/label>\n\s+<input className="input" id="name" name="name" autoComplete="name" required minLength=\{2\} \/>/)
  assert.match(page, /<label className="fieldLabel" htmlFor="email">\{t\('Email'\)\}<\/label>\n\s+<input className="input" id="email" name="email" type="email" autoComplete="email"/)
  assert.match(page, /id="password" name="password" type="password" autoComplete="new-password" required minLength=\{8\} maxLength=\{128\} aria-describedby="password-hint" \/>\n\s+<p className="authHint" id="password-hint">\{t\('At least 8 characters\.'\)\}<\/p>/)
  // The limits match what the server accepts.
  assert.match(read('app/account/register/server.ts'), /if \(name\.length < 2 \|\| !email \|\| password\.length<8\|\|password\.length>128\)/)
  assert.equal((page.match(/<div className="alert danger" role="alert">/g) || []).length, 3)
  assert.match(page, /const signIn = next === '\/account' \? '\/account\/login' : `\/account\/login\?next=\$\{encodeURIComponent\(next\)\}`/)
  assert.match(page, /<p className="authDivider">\{t\('Already have an account\?'\)\}<\/p>\n\s+<Link className="authSecondary" href=\{signIn\}>\{t\('Sign in'\)\}<\/Link>/)
  for (const text of ['Welcome', 'It takes a minute. We send you a link to confirm your email.', 'At least 8 characters.']) assert.ok(AR[text], text)
})

test('forgot password, reset password and check your email use the same card on its own', () => {
  const pages: [string, string][] = [['app/account/forgot-password/form.tsx', 'KeyRound'], ['app/account/reset-password/form.tsx', 'LockKeyhole'], ['app/account/check-email/page.tsx', 'MailCheck']]
  for (const [file, icon] of pages) {
    const src = read(file)
    assert.match(src, /<main className="section authPage">/, file)
    assert.match(src, /<div className="authShell isSolo">/, file)
    assert.match(src, new RegExp(`<span className="authBadge" aria-hidden="true"><${icon} size=\\{22\\} /></span>`), file)
    assert.match(src, /<h1 className="authTitle">/, file)
    assert.doesNotMatch(src, /className="h2" style=\{\{ fontSize: 42/, file)
  }
  const reset = read('app/account/reset-password/form.tsx')
  assert.match(reset, /aria-describedby="password-hint" value=\{password\}/)
  assert.doesNotMatch(reset, /placeholder=\{t\('8\+ characters'\)\}/, 'the rule is a hint under the field, not a placeholder')
  assert.match(reset, /\{!token && <div className="alert danger" role="alert">/)
  // The resend form inside the check-email card has a label tied to its field.
  const resend = read('components/resend-verification.tsx')
  assert.match(resend, /<label className="fieldLabel" htmlFor="resend-email">\{t\('Email'\)\}<\/label>\n\s+<input className="input" id="resend-email" name="email" type="email" autoComplete="email"/)
  const css = read('app/storefront-account.css')
  assert.match(css, /html body\.mk \.authShell\.isSolo \{ max-width: 520px; grid-template-columns: minmax\(0, 1fr\); min-height: 0; \}/)
  assert.match(css, /html body\.mk \.authSubmit:disabled \{ opacity: \.5;/, 'reset password without its link looks unusable')
  assert.match(css, /html\[dir="rtl"\] body\.mk \.authBack svg \{ transform: scaleX\(-1\); \}/)
  assert.ok(contrast('#b42318', '#fdecea') >= 4.5, 'an error under the resend form')
})

test('on phones a checkout field never scrolls in behind the pinned Place order bar', () => {
  const css = read('app/checkout/checkout.module.css')
  assert.match(css, /\.placeBar \{ position: sticky; bottom: calc\(var\(--cookie-banner-height, 0px\) \+ 8px\);/, 'the bar is unchanged')
  assert.match(css, /@media \(max-width: 959px\) \{\n  :global\(html\):has\(\.placeBar\) \{ scroll-padding-bottom: calc\(var\(--cookie-banner-height, 0px\) \+ 170px\); \}\n\}/)
})

test('a policy, and a blog post, keep the direction they are written in', () => {
  assert.match(read('components/legal-page.tsx'), /<div className="aliLegalBody" dir="auto" dangerouslySetInnerHTML=\{\{ __html: sanitizeRichHtml\(html\) \}\} \/>/)
  const post = read('app/blog/[handle]/page.tsx')
  assert.match(post, /<h1 dir="auto" style=\{\{ marginTop: 16 \}\}>\{post\.title\}<\/h1>/)
  assert.match(post, /<div dir="auto" dangerouslySetInnerHTML=\{\{ __html: sanitizeRichHtml\(post\.bodyHtml\) \}\} \/>/)
})

test('policies and blog pages have a main landmark, so "Skip to content" has somewhere to go', () => {
  // components/skip-link.tsx focuses the page's <main>; these pages had none (axe: landmark-one-main, region).
  assert.match(read('components/skip-link.tsx'), /const main = document\.querySelector\('main'\)/)
  for (const file of ['components/legal-page.tsx', 'app/blog/[handle]/page.tsx', 'app/blog/page.tsx']) {
    const src = read(file)
    assert.match(src, /<main className="focalStorefront">/, file)
    assert.doesNotMatch(src, /<div className="focalStorefront">/, file)
  }
})

test('policies read at a comfortable size and measure', () => {
  const css = read('app/storefront-pages.css')
  assert.match(css, /html body\.mk \.aliLegalPage :is\(p, ul, ol\) \{ max-width: 68ch; line-height: 1\.7; \}/)
  assert.match(css, /html body\.mk \.aliLegalPage :is\(p, li\):not\(\.aliLegalUpdated, \.aliLegalNote\) \{ font-size: 16px; \}/)
  assert.match(css, /html body\.mk \.aliLegalPage :is\(ul, ol\) \{ padding-left: 0; padding-inline-start: 22px; \}/)
  // The rules they replace.
  const legacy = read('app/storefront-legacy.css')
  assert.match(legacy, /\.aliLegalPage\{padding:36px 0 60px;max-width:760px\}/)
  assert.match(legacy, /\.aliLegalPage ul\{margin:0 0 14px;padding-left:20px;/)
})

test('the stores page shows each store as a card with real buttons, or says how to buy without one', () => {
  const page = read('app/stores/page.tsx')
  assert.match(page, /<h2 className="storeCardName">\{store\.name\}<\/h2>/, 'a heading per store, under the page title')
  assert.match(page, /<a className="storeCardBtn isPrimary" href=\{`https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=\$\{encodeURIComponent\(`\$\{store\.name\} \$\{store\.address\}`\)\}`\} target="_blank" rel="noopener noreferrer">/)
  assert.match(page, /<a className="storeCardBtn" href=\{tel\}><Phone size=\{16\} aria-hidden="true" \/>\{t\('Call'\)\} <span dir="ltr">\{store\.phone\}<\/span><\/a>/)
  assert.match(page, /<section className="storesEmpty" role="status">[\s\S]*<h2>\{t\('Delivered to your door'\)\}<\/h2>[\s\S]*<Link className="focalButton primary" href="\/shop">\{t\('Shop products'\)\}<\/Link>/)
  assert.ok(AR['Delivered to your door'])
  const css = read('app/storefront-pages.css')
  assert.match(css, /html body\.mk \.storeCardBtn \{ display: inline-flex; align-items: center; gap: 8px; min-height: 44px;/)
})

test('the page styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-pages.css'") > layout.indexOf("import './storefront-account.css'"))
  assert.ok(layout.indexOf("import './storefront-account.css'") > 0)
})
