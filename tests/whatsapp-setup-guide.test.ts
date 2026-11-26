import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MANUAL_IDS, buildChecklist, type LaunchFacts } from '@/lib/launch-checklist'
import { whatsappOffers, whatsappSetupSteps, type WhatsAppSetupFacts } from '@/lib/whatsapp-setup'

// Admin › Settings › WhatsApp setup guide (docs/whatsapp-setup-guide-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const nothing: WhatsAppSetupFacts = { enabled: false, phoneNumberId: false, tokenSaved: false, tokenReadable: false, orderTemplates: 0, refillTemplate: false, loginTemplate: false, lastTest: null }
const ready: WhatsAppSetupFacts = { enabled: true, phoneNumberId: true, tokenSaved: true, tokenReadable: true, orderTemplates: 3, refillTemplate: false, loginTemplate: true, lastTest: { ok: true } }
const status = (f: WhatsAppSetupFacts) => Object.fromEntries(whatsappSetupSteps(f).map(s => [s.id, s.status]))

describe('the steps tick themselves from the settings', () => {
  it('nothing set up: every step is to do, and customers get nothing on WhatsApp', () => {
    assert.deepEqual(status(nothing), { meta: 'todo', number: 'todo', key: 'todo', templates: 'todo', test: 'todo' })
    assert.deepEqual(whatsappOffers(nothing), { orderUpdates: false, reminders: false, signIn: false })
  })
  it('all set up and a test received: every step is done', () => {
    assert.deepEqual(status(ready), { meta: 'done', number: 'done', key: 'done', templates: 'done', test: 'done' })
    assert.deepEqual(whatsappOffers(ready), { orderUpdates: true, reminders: false, signIn: true })
    assert.match(whatsappSetupSteps(ready).find(s => s.id === 'templates')!.summary, /order updates 3 of 3, "Running low\?" not set, sign-in code set/)
  })
  it('says what needs attention: a key that can no longer be read, a test that failed', () => {
    assert.equal(status({ ...ready, tokenReadable: false }).key, 'problem')
    assert.deepEqual(whatsappOffers({ ...ready, tokenReadable: false }), { orderUpdates: false, reminders: false, signIn: false }, 'nothing goes out without a readable key')
    const failed = whatsappSetupSteps({ ...ready, lastTest: { ok: false, error: 'the template was not found; check its name and language in Settings (WhatsApp code 132001)' } }).find(s => s.id === 'test')!
    assert.equal(failed.status, 'problem')
    assert.match(failed.summary, /the last test failed: the template was not found/)
    assert.equal(status({ ...ready, enabled: false }).test, 'todo', 'switched off')
    assert.deepEqual(whatsappOffers({ ...ready, enabled: false }), { orderUpdates: false, reminders: false, signIn: false })
  })
})

describe('where the guide is', () => {
  it('its own page, owner only, built from the same template texts the store sends', () => {
    const page = read('app/admin/settings/whatsapp/page.tsx')
    assert.match(page, /await requirePermission\('settings\.manage'\)/)
    assert.match(page, /templateBody\(kind, language\)/)
    assert.match(page, /refillTemplateBody\(language\)/)
    assert.match(page, /templateBody\(kind, 'ar'\)/)
    assert.match(page, /PLAIN_ERRORS\[code\]/)
    assert.match(page, /db\.auditLog\.findFirst\(\{ where: \{ action: 'whatsapp\.test_sent' \}/, 'the last "Send a test" says whether the last step is done')
    // Never shows the key: only whether it is saved and can be read.
    assert.doesNotMatch(page, /\{token\}/)
  })
  it('linked from the WhatsApp settings, which open on the right tab', () => {
    const card = read('components/settings-center-pro.tsx')
    assert.match(card, /<AdminLink className=\{ui\.textLink\} href="\/admin\/settings\/whatsapp">Follow the step-by-step setup guide<\/AdminLink>/)
    assert.match(card, /useState\(\(\) => groups\.some\(g => g\.key === initialTab\) \? initialTab! : 'General'\)/)
    assert.match(read('app/admin/settings/page.tsx'), /initialTab=\{initialTab \|\| undefined\}/)
  })
  it('and from the launch checklist, as an optional step after launch', () => {
    const facts: LaunchFacts = {
      storeName: 'Yalla Haul', logoUrl: '/api/media/logo.svg', contactPhone: '+961 79 137 663', whatsappNumber: '', codOn: true, cardOn: false, freeShippingThreshold: 50,
      announcementText: 'Free delivery over $50', shippingZones: 2, activeProducts: 12, productsWithoutPhoto: 0, productsWithoutPrice: 0, twoStepOn: true, phoneAlertsOn: true,
      emailConfigured: true, maintenanceOn: false, orderCount: 0, arabicOn: true, socialLinks: 3, adTracking: true, footerText: 'Home essentials, delivered.',
      manual: Object.fromEntries(MANUAL_IDS.map(id => [id, '2026-10-17T10:00:00Z'])),
    }
    const item = (f: LaunchFacts) => buildChecklist(f).items.find(i => i.id === 'whatsappcloud')!
    assert.deepEqual({ group: item(facts).group, status: item(facts).status, href: item(facts).href }, { group: 'after', status: 'todo', href: '/admin/settings/whatsapp' })
    assert.equal(item({ ...facts, whatsappOn: true }).status, 'ok')
    assert.equal(buildChecklist(facts).before.total, buildChecklist({ ...facts, whatsappOn: true }).before.total, 'not needed to open the store')
    assert.match(read('lib/launch-facts.ts'), /whatsappOn: map\.get\('whatsapp\.cloud\.enabled'\) === 'true'/)
  })
})
