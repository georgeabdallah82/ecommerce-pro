import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { REVEAL_BLOCKS, REVEAL_GROUPS } from '../components/scroll-reveal'

// Homepage motion (docs/home-redesign-2026-11.md): the hero's pause control and progress, the scroll
// reveals, the product card's second photo, the cart count's pop, and the rule that every animation
// is off for visitors who ask for less motion.

const read = (path: string) => readFileSync(path, 'utf8')

// The CSS with every `@media (prefers-reduced-motion: no-preference) { ... }` block, every
// @keyframes block and the print block taken out: what applies to everyone.
function outsideMotionBlocks(source: string) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
  let out = ''
  let i = 0
  const opener = /@media \(prefers-reduced-motion: no-preference\)|@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\)|@media print|@keyframes [\w-]+/g
  for (const m of css.matchAll(opener)) {
    if (m.index! < i) continue
    out += css.slice(i, m.index)
    let depth = 0
    let j = css.indexOf('{', m.index)
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}' && --depth === 0) break
    }
    i = j + 1
  }
  return out + css.slice(i)
}

test('hero: a pause button, holds on hover, keyboard focus and off screen, and no rotation for reduced motion', () => {
  const src = read('components/market-sections.tsx')
  assert.match(src, /className="mkHeroToggle" aria-label=\{stopped \? tr\('Play slides'\) : tr\('Pause slides'\)\}/)
  assert.match(src, /const running = auto && !stopped && !hovered && !focused && !away/)
  assert.match(src, /const auto = count > 1 && s\.autoplay !== false && !preview/, 'never rotates in the theme editor')
  assert.match(src, /useEffect\(\(\) => \{ if \(reduceMotion\(\)\) setStopped\(true\) \}, \[\]\)/)
  assert.match(src, /onPointerEnter=\{e => \{ if \(e\.pointerType === 'mouse'\) setHovered\(true\) \}\}/, 'a tap on a phone does not freeze the slides')
  assert.match(src, /onFocus=\{e => setFocused\(keyboardFocus\(e\.target\)\)\}/)
  assert.match(src, /el\.matches\(':focus-visible'\)/)
  assert.match(src, /document\.addEventListener\('visibilitychange', sync\)/)
  assert.match(src, /new IntersectionObserver\(\(\[entry\]\) => \{ offscreen = !entry\.isIntersecting; sync\(\) \}\)/)
  assert.match(src, /aria-live=\{running \? 'off' : 'polite'\}/)
})

test('hero: a hold keeps the time left, so the dot progress and the timer agree', () => {
  const src = read('components/market-sections.tsx')
  assert.match(src, /useEffect\(\(\) => \{ left\.current = speed \}, \[index, speed\]\)/, 'a new slide gets the full time')
  assert.match(src, /window\.setTimeout\(\(\) => setIndex\(i => \(i \+ 1\) % count\), left\.current\)/)
  assert.match(src, /left\.current = Math\.max\(0, left\.current - \(Date\.now\(\) - started\)\)/)
  assert.match(src, /if \(stopped\) \{ left\.current = speed; setFocused\(false\) \} setStopped\(!stopped\)/, 'play restarts the slide with a fresh bar, at once even from the keyboard')
  assert.match(src, /'--mk-hero-speed': `\$\{speed\}ms`/)
  const css = read('app/storefront-motion.css')
  assert.match(css, /animation: mkDotFill var\(--mk-hero-speed, 5s\) linear both;/)
  assert.match(css, /html body\.mk \.mkHero\[data-paused\] \.mkDotFill::before \{ animation-play-state: paused; \}/)
  const ar = read('lib/i18n-ar.ts')
  assert.match(ar, /"Pause slides": /)
  assert.match(ar, /"Play slides": /)
})

test('scroll reveal: market home only, never what is already on screen, never for reduced motion', () => {
  const src = read('components/scroll-reveal.tsx')
  assert.match(src, /if \(typeof IntersectionObserver === 'undefined' \|\| window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return/)
  assert.match(src, /const fold = window\.innerHeight\n/)
  assert.match(src, /if \(!el\.getClientRects\(\)\.length \|\| el\.getBoundingClientRect\(\)\.top < fold\) return/)
  assert.match(read('app/page.tsx'), /\{theme\.design==='market'&&<ScrollReveal\/>\}/)
  // Every class the reveal looks for is still rendered by a homepage section.
  const markup = read('components/market-sections.tsx') + read('components/storefront-sections.tsx')
  for (const sel of `${REVEAL_BLOCKS}, ${REVEAL_GROUPS}`.split(',').map(s => s.trim().slice(1))) {
    assert.match(markup, new RegExp(`className=[{"\`][^>]*\\b${sel}\\b`), `${sel} is still in the markup`)
  }
})

test('product card: the second photo loads on the first mouse hover only, as a decorative image', () => {
  const src = read('components/storefront-sections.tsx')
  assert.match(src, /onPointerEnter=\{secondaryImage&&!peek\?e=>\{if\(e\.pointerType==='mouse'\)setPeek\(true\)\}:undefined\}/)
  assert.match(src, /\{peek&&secondaryImage&&<img className=\{`mkCardAlt\$\{peekReady\?' isReady':''\}`\} src=\{img\(secondaryImage\)\} alt="" decoding="async" onLoad=\{\(\)=>setPeekReady\(true\)\}\/>\}/)
  const css = read('app/storefront-motion.css')
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\n  html body\.mk \.mkCard:hover \.mkCardAlt\.isReady \{ opacity: 1; \}/)
})

test('header: the cart count pops when something is added, not when the saved cart loads', () => {
  const src = read('components/store-nav-fixed.tsx')
  assert.match(src, /if \(!cartReady\) return\n    if \(shownCount\.current !== null && count > shownCount\.current\) setBump\(b => b \+ 1\)/)
  assert.match(src, /<span key=\{bump\} className=\{bump \? 'focalCartCount isBumped' : 'focalCartCount'\}/)
})

test('motion CSS: imported last, and nothing moves or hides for visitors who ask for less motion', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-motion.css'") > layout.indexOf("import './storefront-home.css'"), 'loaded after the homepage styles')
  const css = read('app/storefront-motion.css')
  const everyone = outsideMotionBlocks(css)
  // The only animation outside a no-preference block is the dot's progress bar, which the
  // reduced-motion block hides.
  const animations = [...everyone.matchAll(/animation(?:-name)?: ([\w-]+)/g)].map(m => m[1])
  assert.deepEqual([...new Set(animations)].sort(), ['mkDotFill', 'mkDotFillRtl'])
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n[^@]*html body\.mk \.mkDotFill \{ display: none; \}/)
  assert.doesNotMatch(everyone, /\.rvl(?:Self|Kids)[^{]*\{[^}]*opacity: 0/, 'held sections are hidden only when motion is welcome')
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\n  html body\.mk \.rvlSelf, html body\.mk \.rvlKids > \* \{ opacity: 0; \}/)
  assert.match(css, /@media print \{\n  html body\.mk \.rvlSelf, html body\.mk \.rvlKids > \* \{ opacity: 1 !important; animation: none !important; \}/)
})
