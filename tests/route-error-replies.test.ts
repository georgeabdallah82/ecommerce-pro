import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routeError } from '@/lib/api-error'
import { userError } from '@/lib/user-error'

const read = (path: string) => readFileSync(path, 'utf8')

// Routes whose failures used to be answered with the text of the error itself. Each now answers
// through routeError, which sends only the text of a UserError.
const ROUTES = [
  'app/api/admin/tax-rates/route.ts',
  'app/api/admin/shipping/route.ts',
  'app/api/admin/blog-posts/route.ts',
  'app/api/admin/pages/route.ts',
  'app/api/admin/redirects/route.ts',
  'app/api/admin/locations/route.ts',
  'app/api/admin/collections/[id]/route.ts',
  'app/api/admin/webhooks/route.ts',
  'app/api/admin/webhooks/[id]/redeliver/route.ts',
  'app/api/admin/activity/route.ts',
  'app/api/admin/reports/route.ts',
  'app/api/admin/coupons/route.ts',
  'app/api/admin/invites/route.ts',
  'app/api/admin/influencers/route.ts',
  'app/api/admin/marketing/push-campaign/route.ts',
  'app/api/account/push/route.ts',
  'app/api/admin/imports/route.ts',
  'app/api/admin/products/import/route.ts',
  'app/api/admin/inventory/transfers/[id]/route.ts',
  'app/api/admin/purchase-orders/[id]/route.ts',
  'app/api/admin/gift-cards/route.ts',
  'app/api/admin/orders/route.ts',
  'app/api/admin/order-edits/[id]/route.ts',
  'app/api/internal/payment-status/route.ts',
  'app/api/admin/customers/segments/[id]/recompute/route.ts',
]

test('the routes that used to echo an error\'s own text now answer through routeError', () => {
  for (const file of ROUTES) {
    const source = read(file)
    assert.match(source, /routeError\(/, `${file} must reply through routeError`)
    assert.doesNotMatch(source, /json\(\{ error: message \}/, `${file} must not echo the text of the error`)
  }
})

test('the statuses that used to come from an error\'s text are set where the error is thrown', () => {
  const kept: [string, RegExp][] = [
    ['app/api/admin/order-edits/[id]/route.ts', /throw userError\('Order edit not found', 404\)/],
    ['app/api/admin/order-edits/[id]/route.ts', /throw userError\('Order edit is no longer open', 409\)/],
    ['app/api/admin/order-edits/[id]/route.ts', /throw userError\(ORDER_EDIT_ORDER_CONFLICT_MESSAGE, 409\)/],
    ['app/api/admin/order-edits/[id]/route.ts', /throw userError\('Order not found', 404\)/],
    ['app/api/admin/inventory/transfers/[id]/route.ts', /throw userError\(TRANSFER_CONFLICT_MESSAGE, 409\)/],
    ['app/api/admin/purchase-orders/[id]/route.ts', /throw userError\(PO_RECEIVE_CONFLICT_MESSAGE, 409\)/],
    ['app/api/admin/gift-cards/route.ts', /throw userError\('This gift card was just modified — please retry\.', 409\)/],
    ['app/api/admin/orders/route.ts', /throw userError\(ORDER_UPDATE_CONFLICT_MESSAGE, 409\)/],
    ['app/api/internal/payment-status/route.ts', /throw userError\('Order not found', 404\)/],
    ['app/api/internal/payment-status/route.ts', /throw userError\('Payment externalId is already associated with another order', 409\)/],
    ['app/api/internal/payment-status/route.ts', /Invalid payment transition: \$\{order\.paymentStatus\} → \$\{status\}`, 409\)/],
    ['lib/webhooks.ts', /throw userError\('Webhook endpoint not found', 404\)/],
    ['lib/customer-segments.ts', /throw userError\('Segment not found', 404\)/],
  ]
  for (const [file, pattern] of kept) assert.match(read(file), pattern, `${file} must set the status at the throw`)
})

test('routeError sends the headers a route passes in, with the status it answers with', async () => {
  const reply = routeError(userError('That value is taken', 409), 'Unable to save', 400, { 'Cache-Control': 'private, no-store' })
  assert.equal(reply.status, 409)
  assert.equal(reply.headers.get('Cache-Control'), 'private, no-store')
  const generic = routeError(new Error('database down'), 'Unable to save', 400, { 'Cache-Control': 'private, no-store' })
  assert.equal(generic.status, 500)
  assert.equal(generic.headers.get('Cache-Control'), 'private, no-store')
})
