import test from 'node:test'
import assert from 'node:assert/strict'
import { MAINTENANCE_DEFAULTS, maintenanceText } from '../lib/maintenance-defaults'
import { renderMaintenancePage } from '../lib/maintenance-page'

test('the old coming-soon texts and empty fields fall back to the maintenance defaults', () => {
  assert.equal(maintenanceText("We're launching soon", MAINTENANCE_DEFAULTS.headline), MAINTENANCE_DEFAULTS.headline)
  assert.equal(maintenanceText("We're putting the finishing touches on something great. Check back soon.", MAINTENANCE_DEFAULTS.message), MAINTENANCE_DEFAULTS.message)
  assert.equal(maintenanceText('   ', MAINTENANCE_DEFAULTS.headline), MAINTENANCE_DEFAULTS.headline)
  assert.equal(maintenanceText(undefined, MAINTENANCE_DEFAULTS.headline), MAINTENANCE_DEFAULTS.headline)
})

test('the owner’s own texts are kept', () => {
  assert.equal(maintenanceText('  Closed for stock-taking  ', MAINTENANCE_DEFAULTS.headline), 'Closed for stock-taking')
})

const base = { brand: 'Yalla Haul', headline: "We'll be right back", message: 'Back soon.' }

test('the page shows the texts, escaped', () => {
  const html = renderMaintenancePage({ ...base, headline: '<script>alert(1)</script>', message: 'Tom & "Jerry"', backBy: 'Back by 6 pm' })
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('Tom &amp; &quot;Jerry&quot;'))
  assert.ok(html.includes('Back by 6 pm'))
  assert.ok(html.includes('name="robots" content="noindex"'))
})

test('the expected-back note, buttons and preview banner only show when set', () => {
  const html = renderMaintenancePage(base)
  assert.ok(!html.includes('class="back"'))
  assert.ok(!html.includes('class="btns"'))
  assert.ok(!html.includes('class="preview"'))
  assert.ok(renderMaintenancePage({ ...base, preview: true }).includes('class="preview"'))
})

test('WhatsApp and email buttons accept only real wa.me links and addresses', () => {
  const ok = renderMaintenancePage({ ...base, whatsappUrl: 'https://wa.me/96170123456', email: 'info@yallahaul.com' })
  assert.ok(ok.includes('href="https://wa.me/96170123456"'))
  assert.ok(ok.includes('href="mailto:info@yallahaul.com"'))
  const bad = renderMaintenancePage({ ...base, whatsappUrl: 'javascript:alert(1)', email: 'a"><b>@x.com' })
  assert.ok(!bad.includes('javascript:'))
  assert.ok(!bad.includes('mailto:'))
})

test('the logo and colour are used only when safe', () => {
  const ok = renderMaintenancePage({ ...base, logoUrl: 'https://media.yallahaul.com/logo.png', color: '#1a7f37' })
  assert.ok(ok.includes('<img src="https://media.yallahaul.com/logo.png"'))
  assert.ok(ok.includes('#1a7f37'))
  const bad = renderMaintenancePage({ ...base, logoUrl: '//evil.example/x.png', color: 'red;}body{display:none' })
  assert.ok(!bad.includes('evil.example'))
  assert.ok(!bad.includes('display:none'))
  assert.ok(bad.includes('#d42a2a'))
  assert.ok(bad.includes('>Yalla Haul<'))
})

test('maintenance mode closes the store but not staff pages, the driver list or stopping emails', async () => {
  const { isBlockedDuringMaintenance, skipsMaintenanceCheck } = await import('../lib/maintenance-paths')
  for (const path of ['/admin', '/admin/orders', '/maintenance', '/unsubscribe', '/driver/abcdefghijklmnopqrstuvwx']) assert.ok(skipsMaintenanceCheck(path), path)
  for (const path of ['/', '/shop', '/product/soap', '/checkout', '/drivers', '/driver']) assert.ok(!skipsMaintenanceCheck(path), path)
  assert.equal(isBlockedDuringMaintenance('/api/checkout', 'POST'), true)
  assert.equal(isBlockedDuringMaintenance('/api/products', 'GET'), false)
  assert.equal(isBlockedDuringMaintenance('/api/driver/abcdefghijklmnopqrstuvwx', 'POST'), false, 'drivers can still mark deliveries')
  assert.equal(isBlockedDuringMaintenance('/api/questions', 'POST'), true)
})

test('each page type shows its own badge, icon and wording', async () => {
  const { MAINTENANCE_MODE_INFO, maintenanceMode } = await import('../lib/maintenance-defaults')
  assert.equal(maintenanceMode('coming_soon'), 'coming_soon')
  assert.equal(maintenanceMode('nonsense'), 'maintenance')
  assert.equal(maintenanceMode(undefined), 'maintenance')
  for (const mode of ['maintenance', 'under_construction', 'coming_soon', 'updating'] as const) {
    const html = renderMaintenancePage({ ...base, mode, headline: MAINTENANCE_MODE_INFO[mode].headline, message: MAINTENANCE_MODE_INFO[mode].message })
    assert.ok(html.includes(`>${MAINTENANCE_MODE_INFO[mode].badge}<`), mode)
    assert.ok(html.includes('<svg'), mode)
  }
  assert.ok(renderMaintenancePage({ ...base, mode: 'under_construction' }).includes('Under construction'))
})

test('a saved default text from another page type is replaced by the selected type’s wording', async () => {
  const { maintenanceFromSettings } = await import('../lib/maintenance')
  const cfg = maintenanceFromSettings({ 'maintenance.enabled': 'true', 'maintenance.mode': 'coming_soon', 'maintenance.headline': "We'll be right back", 'maintenance.message': '' })
  assert.equal(cfg.mode, 'coming_soon')
  assert.equal(cfg.headline, 'Something new is coming soon')
  const custom = maintenanceFromSettings({ 'maintenance.mode': 'updating', 'maintenance.headline': 'Our new site is almost ready' })
  assert.equal(custom.headline, 'Our new site is almost ready')
  assert.equal(custom.message, 'We are improving the store to make shopping faster and easier for you. Thank you for your patience.')
})
