import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Customers can't cancel their own orders (only by contacting the store); a customer can delete
// their account; product and collection pages tell Google their breadcrumb trail.
const read = (file: string) => readFileSync(file, 'utf8')

describe('customers cannot cancel their own orders', () => {
  it('the customer cancel routes and their buttons are gone', () => {
    assert.equal(existsSync('app/api/orders/cancel/route.ts'), false)
    assert.equal(existsSync('app/api/account/orders/[orderNumber]/cancel/route.ts'), false)
    assert.equal(existsSync('components/cancel-order-button.tsx'), false)
    assert.equal(existsSync('components/guest-cancel-box.tsx'), false)
  })
  it('the order pages tell customers to message us instead', () => {
    assert.match(read('app/order/success/page.tsx'), /To cancel this order, message us on WhatsApp\./)
    const account = read('app/account/orders/[orderNumber]/page.tsx')
    assert.match(account, /To cancel this order, message us on WhatsApp\./)
    assert.doesNotMatch(account, /CancelOrderButton|GuestCancelBox|guestCancel/)
  })
  it('the admin no longer offers the customer cancel setting', () => {
    assert.doesNotMatch(read('components/settings-center-pro.tsx'), /guestCancel/)
    assert.doesNotMatch(read('app/admin/settings/page.tsx'), /guestCancel/)
  })
})

describe('customers can delete their own account', () => {
  const route = read('app/api/account/delete/route.ts')
  it('only customers, after the password is checked, and rate limited', () => {
    assert.match(route, /if \(user\.role !== 'CUSTOMER'\) return json\(\{ error: 'Forbidden' \}, \{ status: 403 \}\)/)
    assert.match(route, /verifyPassword\(password, user\.passwordHash\)/)
    assert.match(route, /consumeDurableRateLimit\(`account-delete:\$\{user\.id\}`, 5,/)
  })
  it('removes the account with the same cleanup as the admin, and signs out', () => {
    assert.match(route, /deleteCustomerCascade\(db, user\.id\)/)
    assert.match(route, /clearSession\(\)/)
  })
  it('the account page offers it', () => {
    assert.match(read('app/account/page.tsx'), /<ChangePassword\/><DeleteAccount\/>/)
    assert.match(read('components/delete-account.tsx'), /\/api\/account\/delete/)
  })
})

describe('breadcrumb data for Google', () => {
  it('product pages send Home > collection > product', () => {
    const page = read('app/product/[slug]/page.tsx')
    assert.match(page, /'@type': 'BreadcrumbList'/)
    assert.match(page, /JSON\.stringify\(breadcrumb\)/)
  })
  it('collection pages send Home > collection', () => {
    const page = read('app/collections/[slug]/page.tsx')
    assert.match(page, /'@type': 'BreadcrumbList'/)
    assert.match(page, /JSON\.stringify\(breadcrumb\)/)
  })
})
