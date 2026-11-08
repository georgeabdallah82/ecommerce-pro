import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  adminAppForPath,
  adminHostRedirect,
  adminHostsFromEnv,
  appForHostname,
  appHostsConfigured,
  moduleVisibleOn,
  type AdminHosts,
} from '../lib/admin-apps'

const both: AdminHosts = { erp: 'erp.yallahaul.com', pos: 'pos.yallahaul.com', store: 'yallahaul.com' }
const storeOnly: AdminHosts = {}

describe('admin module ownership', () => {
  it('puts the ERP modules on the ERP app and the storefront tools on the store', () => {
    for (const path of ['/admin', '/admin/orders', '/admin/orders/drivers', '/admin/products/prices', '/admin/inventory/transfers', '/admin/purchase-orders/new', '/admin/customers/abc', '/admin/reports', '/admin/settings', '/admin/system']) {
      assert.equal(adminAppForPath(path), 'erp', path)
    }
    for (const path of ['/admin/online-store/theme-editor', '/admin/marketing/win-back', '/admin/coupons', '/admin/media', '/admin/live-visitors', '/admin/reviews']) {
      assert.equal(adminAppForPath(path), 'store', path)
    }
    assert.equal(adminAppForPath('/admin/pos'), 'pos')
  })

  it('matches whole path segments, so customers does not claim customer-segments', () => {
    assert.equal(adminAppForPath('/admin/customer-segments'), 'erp')
    assert.equal(adminAppForPath('/admin/customers'), 'erp')
    assert.equal(adminAppForPath('/admin/ordersx'), null)
    assert.equal(adminAppForPath('/admin/productsfoo'), null)
  })

  it('leaves shared pages with no owner, so every host can reach them', () => {
    assert.equal(adminAppForPath('/admin/login'), null)
    assert.equal(adminAppForPath('/admin/two-step'), null)
  })

  it('maps every admin page in the navigation to an app or to the shared set', () => {
    const layout = readFileSync('app/admin/layout.tsx', 'utf8')
    const hrefs = [...layout.matchAll(/href: '(\/admin[^']*)'/g)].map(m => m[1])
    assert.ok(hrefs.length > 40)
    for (const href of hrefs) {
      assert.ok(['erp', 'pos', 'store', null].includes(adminAppForPath(href)), href)
    }
  })
})

describe('app hosts', () => {
  it('reads the three host variables, trimmed, lowercased and without a scheme or path', () => {
    assert.deepEqual(adminHostsFromEnv({ ERP_HOST: ' ERP.YallaHaul.com ', POS_HOST: 'https://pos.yallahaul.com/x', STORE_HOST: 'yallahaul.com' }), { erp: 'erp.yallahaul.com', pos: 'pos.yallahaul.com', store: 'yallahaul.com' })
    assert.deepEqual(adminHostsFromEnv({}), { erp: undefined, pos: undefined, store: undefined })
  })

  it('treats the app hosts as configured only when one of them is set', () => {
    assert.equal(appHostsConfigured(storeOnly), false)
    assert.equal(appHostsConfigured({ store: 'yallahaul.com' }), false)
    assert.equal(appHostsConfigured({ erp: 'erp.yallahaul.com' }), true)
  })

  it('identifies the app by host, ignoring the port and case', () => {
    assert.equal(appForHostname('erp.yallahaul.com', both), 'erp')
    assert.equal(appForHostname('ERP.yallahaul.com:443', both), 'erp')
    assert.equal(appForHostname('pos.yallahaul.com', both), 'pos')
    assert.equal(appForHostname('yallahaul.com', both), 'store')
    assert.equal(appForHostname(null, both), 'store')
  })
})

describe('host redirects', () => {
  const go = (hostHeader: string, pathname: string, search = '', hosts: AdminHosts = both) =>
    adminHostRedirect({ hostHeader, pathname, search, protocol: 'https:', hosts })

  it('does nothing while no app host is configured, so the admin stays on one host', () => {
    assert.equal(go('yallahaul.com', '/admin/orders', '', storeOnly), null)
    assert.equal(go('yallahaul.com', '/admin/online-store', '', storeOnly), null)
    assert.equal(go('erp.yallahaul.com', '/', '', storeOnly), null)
  })

  it('sends an ERP module from the store host to the ERP host, keeping path and query', () => {
    assert.equal(go('yallahaul.com', '/admin/orders/123', '?status=PENDING'), 'https://erp.yallahaul.com/admin/orders/123?status=PENDING')
    assert.equal(go('yallahaul.com', '/admin', ''), 'https://erp.yallahaul.com/admin')
  })

  it('sends a POS module to the POS host and a store module from the ERP host to the store host', () => {
    assert.equal(go('yallahaul.com', '/admin/pos'), 'https://pos.yallahaul.com/admin/pos')
    assert.equal(go('erp.yallahaul.com', '/admin/online-store'), 'https://yallahaul.com/admin/online-store')
    assert.equal(go('pos.yallahaul.com', '/admin/orders'), 'https://erp.yallahaul.com/admin/orders')
  })

  it('leaves a module on the host it belongs to, and shared pages everywhere', () => {
    assert.equal(go('erp.yallahaul.com', '/admin/products'), null)
    assert.equal(go('erp.yallahaul.com', '/admin'), null)
    assert.equal(go('pos.yallahaul.com', '/admin/pos'), null)
    assert.equal(go('erp.yallahaul.com', '/admin/login'), null)
    assert.equal(go('yallahaul.com', '/admin/login'), null)
  })

  it('never splits localhost, so development and the CI browser test keep every page', () => {
    assert.equal(go('localhost:3000', '/admin/orders', '', both), null)
    assert.equal(go('127.0.0.1:8787', '/admin/online-store', '', both), null)
    assert.equal(go('admin.localhost', '/admin/pos', '', both), null)
    assert.equal(go('erp.localhost', '/products', '', both), null)
  })

  it('keeps the API on whichever host calls it, so a page and its API never split', () => {
    assert.equal(go('erp.yallahaul.com', '/api/admin/products'), null)
    assert.equal(go('yallahaul.com', '/api/admin/orders'), null)
  })

  it('sends storefront pages on a staff host to that host home, and keeps assets and APIs', () => {
    assert.equal(go('erp.yallahaul.com', '/'), 'https://erp.yallahaul.com/admin')
    assert.equal(go('erp.yallahaul.com', '/products/tissue'), 'https://erp.yallahaul.com/admin')
    assert.equal(go('pos.yallahaul.com', '/cart'), 'https://pos.yallahaul.com/admin/pos')
    assert.equal(go('erp.yallahaul.com', '/_next/static/app.js'), null)
    assert.equal(go('erp.yallahaul.com', '/logo.svg'), null)
    assert.equal(go('erp.yallahaul.com', '/api/store/settings'), null)
  })

  it('never sends the storefront host, which keeps serving the shop', () => {
    assert.equal(go('yallahaul.com', '/'), null)
    assert.equal(go('yallahaul.com', '/products/tissue'), null)
    assert.equal(go('yallahaul.com', '/cart'), null)
  })
})

describe('sidebar visibility', () => {
  it('lists every module when no app host is configured', () => {
    assert.equal(moduleVisibleOn('/admin/orders', 'store', storeOnly), true)
    assert.equal(moduleVisibleOn('/admin/online-store', 'store', storeOnly), true)
  })

  it('lists only the current host\'s modules once app hosts are configured', () => {
    assert.equal(moduleVisibleOn('/admin/orders', 'erp', both), true)
    assert.equal(moduleVisibleOn('/admin/orders', 'store', both), false)
    assert.equal(moduleVisibleOn('/admin/online-store', 'store', both), true)
    assert.equal(moduleVisibleOn('/admin/online-store', 'erp', both), false)
    assert.equal(moduleVisibleOn('/admin/login', 'store', both), true)
  })
})
