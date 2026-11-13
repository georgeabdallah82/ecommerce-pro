import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'
import { ratingCountsFrom } from '../lib/product-stats'

// Store details (docs/store-details-2026-11.md): the product page's rating summary and questions, the wallet's
// history and the notifications.

const read = (path: string) => readFileSync(path, 'utf8')

test('the rating breakdown counts every approved review by star, whatever the rows look like', () => {
  assert.deepEqual(ratingCountsFrom([{ rating: 5, _count: { rating: 2 } }, { rating: 4, _count: { rating: 1 } }]), { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 })
  assert.deepEqual(ratingCountsFrom([]), { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  // Out-of-range ratings are kept in range rather than lost.
  assert.deepEqual(ratingCountsFrom([{ rating: 9, _count: { rating: 1 } }, { rating: 0, _count: { rating: 3 } }]), { 1: 3, 2: 0, 3: 0, 4: 0, 5: 1 })
  const stats = read('lib/product-stats.ts')
  assert.match(stats, /storefrontCached\(`rating-counts:\$\{productId\}`, async \(\) => await db\.review\.groupBy\(\{ by: \['rating'\], where: \{ productId, approved: true \}, _count: \{ rating: true \} \}\)/)
  const page = read('app/product/[slug]/page.tsx')
  assert.match(page, /product\.reviews\.length \? getRatingCounts\(product\.id\)\.catch\(\(\) => null\) : Promise\.resolve\(null\),/)
  assert.match(page, /reviewCount: ownStats\?\.reviewCount \|\| 0,\n\s+ratingCounts,/)
})

test('the reviews open with the average, the count and how many gave each star', () => {
  const pdp = read('components/aliexpress-product.tsx')
  // The page lists 24 reviews at most; the count is every approved review.
  assert.match(pdp, /const reviewTotal = Number\(product\.reviewCount\) \|\| reviews\.length/)
  assert.match(pdp, /plural\(reviewTotal, 'review'\)/)
  assert.doesNotMatch(pdp, /plural\(reviews\.length, 'review'\)/)
  assert.match(pdp, /<h2>\{t\('Customer Reviews'\)\}<\/h2>\n\s+\{\/\* The rating at a glance/)
  assert.match(pdp, /<span className="srOnly">\{t\('Rated \{rating\} out of 5', \{ rating: avgRating\.toFixed\(1\) \}\)\}<\/span>/)
  assert.match(pdp, /\{\[5, 4, 3, 2, 1\]\.map\(star => \{/)
  assert.match(pdp, /<span className="aliReviewBar" aria-hidden="true"><span style=\{\{ width: `\$\{reviewTotal \? Math\.round\(count \/ reviewTotal \* 100\) : 0\}%` \}\} \/><\/span>/)
  assert.match(pdp, /<span className="srOnly">\{t\('\{stars\} stars: \{count\}', \{ stars: star, count \}\)\}<\/span>/)
  for (const text of ['Rated {rating} out of 5', '{stars} stars: {count}']) assert.ok(AR[text], text)
})

test('with no question yet, the questions section says so beside its button', () => {
  const qa = read('components/product-questions.tsx')
  assert.match(qa, /const empty = questions\.length === 0 && !open && !sent/)
  assert.match(qa, /\{empty && <p className="aliQaNone">\{t\('No questions yet\. Ask one and we will answer it here\.'\)\}<\/p>\}/)
  assert.ok(AR['No questions yet. Ask one and we will answer it here.'])
  assert.match(read('app/storefront-details.css'), /html body\.mk \.aliQaEmpty > \.aliQaAsk \{ grid-column: 2; grid-row: 1 \/ span 2; margin-top: 0; \}/)
})

test('each wallet and coin entry reads as words, a note and a date, not a run-together code', () => {
  const wallet = read('app/account/wallet/page.tsx')
  // It printed tx.type as is ("DEBIT", "REDEMPTION") with the note and date jammed against it.
  assert.doesNotMatch(wallet, /tx\.type\.replaceAll\('_',' '\)/)
  assert.match(wallet, /<small>\{tx\.reason \? <><span dir="auto">\{tx\.reason\}<\/span> · <\/> : null\}\{tx\.createdAt\.toLocaleString\(locale, \{ dateStyle: 'medium', timeStyle: 'short' \}\)\}<\/small>/)
  assert.match(wallet, /WALLET_LABELS\[tx\.type\] \? t\(WALLET_LABELS\[tx\.type\]\) : plainWords\(tx\.type\)/)
  assert.match(wallet, /COIN_LABELS\[tx\.type\] \? t\(COIN_LABELS\[tx\.type\]\) : plainWords\(tx\.type\), tx\.amount\.toLocaleString\(\)/)
  // Every type the code writes has a label, in both languages.
  for (const code of ['CREDIT', 'DEBIT', 'PAYMENT', 'REFUND', 'REVERSAL', 'ADJUSTMENT', 'EXPIRED']) {
    const label = wallet.match(new RegExp(`${code}: markT\\('([^']+)'\\)`))?.[1]
    assert.ok(label && AR[label], `wallet ${code}`)
  }
  const coinBlock = wallet.slice(wallet.indexOf('const COIN_LABELS'))
  for (const code of ['CREDIT', 'DEBIT', 'EARN', 'REDEMPTION', 'REFUND', 'REVERSAL', 'EXPIRED']) {
    const label = coinBlock.match(new RegExp(`${code}: markT\\('([^']+)'\\)`))?.[1]
    assert.ok(label && AR[label], `coins ${code}`)
  }
})

test('notifications have an icon for what they are about, and unread ones stand out', () => {
  const page = read('app/account/notifications/page.tsx')
  assert.match(page, /const NOTICE_ICONS: Record<string, LucideIcon> = \{ ORDER_CREATED: ShoppingBag, ORDER_STATUS: Truck, ORDER_REFUND: RotateCcw, GIFT_CARD: Gift \}/)
  assert.match(page, /const Icon = NOTICE_ICONS\[n\.type\] \|\| Bell/)
  assert.match(page, /<div className=\{n\.readAt \? 'card noticeCard' : 'card noticeCard isUnread'\} key=\{n\.id\}>/)
  // The stored title and text are English; they keep their own direction on the Arabic page.
  assert.match(page, /<strong dir="auto">\{n\.title\}<\/strong>/)
  assert.match(page, /<p className="muted" dir="auto">\{n\.body\}<\/p>/)
  // Each type written by the checkout and the admin has its icon.
  for (const type of ['ORDER_CREATED', 'ORDER_STATUS', 'ORDER_REFUND', 'GIFT_CARD']) assert.match(page, new RegExp(`${type}: [A-Z]`))
  assert.match(read('app/api/checkout/route.ts'), /type: 'ORDER_CREATED'/)
})

test('the detail styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-details.css'") > layout.indexOf("import './storefront-pages.css'"))
})
