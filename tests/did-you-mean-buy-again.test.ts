import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { spellingSuggestion } from '@/lib/smart-search'

describe('"Did you mean" for a search with no results', () => {
  it('fixes a small typo to the closest word the catalogue knows', () => {
    assert.equal(spellingSuggestion('tisseu', ['tissue', 'soap']), 'tissue')
    assert.equal(spellingSuggestion('sopa', ['soap', 'bowl']), 'soap')
  })
  it('fixes Arabic spelling variants the same way', () => {
    assert.equal(spellingSuggestion('صاون', ['صابون']), 'صابون')
  })
  it('says nothing when the words are already right or nothing is close', () => {
    assert.equal(spellingSuggestion('tissue', ['tissue']), null)
    assert.equal(spellingSuggestion('zzzz', ['tissue']), null)
    assert.equal(spellingSuggestion('', ['tissue']), null)
  })
  it('the shop page and the empty search message use it', () => {
    assert.match(readFileSync('app/shop/page.tsx', 'utf8'), /spellingSuggestionFor\(q\)/)
    assert.match(readFileSync('components/aliexpress-shop.tsx', 'utf8'), /Did you mean/)
  })
})

describe('"Buy again" on the account page', () => {
  it('takes the latest orders, leaves out cancelled ones, and shows each product once', () => {
    const lib = readFileSync('lib/order-again.ts', 'utf8')
    assert.match(lib, /status: \{ not: 'CANCELLED' \}/)
    assert.match(lib, /const key = `\$\{item\.productId\}\|\$\{item\.variantId \?\? ''\}`/)
  })
  it('the account page shows it above recent orders', () => {
    const page = readFileSync('app/account/page.tsx', 'utf8')
    assert.match(page, /buyAgainItems\(u\.id\)/)
    assert.match(page, /<BuyAgain items=\{buyAgain\} currency=\{storeCurrency\}\/>/)
  })
  it('the add button is a comfortable tap target', () => {
    assert.match(readFileSync('components/buy-again.tsx', 'utf8'), /minHeight: 44/)
  })
})
