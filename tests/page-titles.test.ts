import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Each of these pages shows its own name in the browser tab and in search results. Without it,
// they fell back to the generic store title.
const pages: Array<[string, string]> = [
  ['app/cart/page.tsx', 'Cart'],
  ['app/checkout/layout.tsx', 'Checkout'],
  ['app/account/login/page.tsx', 'Sign in'],
  ['app/privacy-policy/page.tsx', 'Privacy policy'],
  ['app/terms-of-service/page.tsx', 'Terms of service'],
  ['app/refund-policy/page.tsx', 'Refund policy'],
]

describe('page titles', () => {
  for (const [file, title] of pages) {
    it(`${file} sets its own title "${title}"`, () => {
      assert.match(readFileSync(file, 'utf8'), new RegExp(`export const metadata: Metadata = \\{ title: '${title}' \\}`))
    })
  }
})
