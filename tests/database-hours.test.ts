import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { databaseHoursAdvice } from '@/lib/database-hours'
import { waitingLines, type DailySummaryFacts } from '@/lib/daily-summary'
import { MANUAL_IDS, buildChecklist, type LaunchFacts } from '@/lib/launch-checklist'

const usage = (usedHours: number, projectedHours: number | null, daysLeft: number | null, limitHours = 100) => ({ usedHours, limitHours, projectedHours, daysLeft, warning: false })

describe('database hours advice', () => {
  it('says nothing when the hours are unknown or the numbers are unusable', () => {
    assert.equal(databaseHoursAdvice(null), null)
    assert.equal(databaseHoursAdvice(undefined), null)
    assert.equal(databaseHoursAdvice(usage(Number.NaN, 10, 5)), null)
    assert.equal(databaseHoursAdvice(usage(10, 20, 5, 0)), null)
  })

  it('is fine early in the month with little used', () => {
    const a = databaseHoursAdvice(usage(10, 30, 20))!
    assert.equal(a.level, 'ok')
    assert.equal(a.percent, 10)
    assert.match(a.short, /^Database hours: 10 of 100 used$/)
  })

  it('asks the owner to keep an eye on it from half the hours (today\'s real numbers)', () => {
    const a = databaseHoursAdvice(usage(55.5, 88, 9))!
    assert.equal(a.level, 'watch')
    assert.equal(a.percent, 56)
    assert.ok(a.runsOutInDays! > 12 && a.runsOutInDays! < 13, String(a.runsOutInDays))
    assert.equal(a.short, 'Database hours: 55.5 of 100 used')
    assert.match(a.text, /pay-as-you-go plan/)
    assert.match(a.text, /about 6 hours a day/)
  })

  it('also watches when a low use is heading for most of the hours', () => {
    assert.equal(databaseHoursAdvice(usage(30, 85, 20))!.level, 'watch')
  })

  it('is urgent when the hours would run out well before the month ends', () => {
    const a = databaseHoursAdvice(usage(60, 160, 10))!
    assert.equal(a.level, 'urgent')
    assert.equal(Math.round(a.runsOutInDays!), 4)
    assert.match(a.text, /run out in about 4 days, before the month ends/)
    assert.match(a.short, /\(running out early\)/)
  })

  it('is urgent from 85% used', () => {
    assert.equal(databaseHoursAdvice(usage(86, null, null))!.level, 'urgent')
  })
})

describe('database hours in the morning summary and the launch checklist', () => {
  const facts: DailySummaryFacts = { storeName: 'S', dayLabel: 'Thursday', currency: 'USD', ordersYesterday: 0, salesYesterday: 0, toConfirm: 0, toPrepare: 0, outForDelivery: 0, lowStock: [], pendingReviews: 0, reviewEmailsSent: 0 }

  it('adds one line to what is waiting only when the hours need attention', () => {
    assert.deepEqual(waitingLines(facts), [])
    assert.deepEqual(waitingLines({ ...facts, databaseHours: 'Database hours: 55.5 of 100 used' }), ['Database hours: 55.5 of 100 used'])
  })

  const ready: LaunchFacts = {
    storeName: 'Yalla Haul', logoUrl: '/logo.svg', contactPhone: '+961 79 137 663', whatsappNumber: '', codOn: true, cardOn: false, freeShippingThreshold: 50,
    announcementText: 'Free delivery over $50', shippingZones: 2, activeProducts: 12, productsWithoutPhoto: 0, productsWithoutPrice: 0, twoStepOn: true, phoneAlertsOn: true,
    emailConfigured: true, maintenanceOn: false, orderCount: 0, arabicOn: true, socialLinks: 3, adTracking: true, footerText: 'Home essentials.',
    manual: {},
  }
  const dbplan = (f: LaunchFacts) => buildChecklist(f).items.find(i => i.id === 'dbplan')!

  it('has a "database plan" step before launch that the owner ticks, with today\'s numbers when known', () => {
    assert.ok(MANUAL_IDS.includes('dbplan'))
    const todo = dbplan(ready)
    assert.equal(todo.group, 'before')
    assert.equal(todo.status, 'todo')
    assert.equal(todo.manual, true)
    assert.match(todo.detail, /pay-as-you-go plan/)
    assert.doesNotMatch(todo.detail, /Right now/)
    assert.match(dbplan({ ...ready, databaseHours: 'Database hours: 55.5 of 100 used' }).detail, /Right now: Database hours: 55.5 of 100 used\./)
    assert.equal(dbplan({ ...ready, manual: { dbplan: '2026-10-24T08:00:00Z' } }).status, 'ok')
  })

  it('is wired into the daily job and the launch facts without ever failing them', () => {
    const daily = readFileSync('app/api/internal/daily/route.ts', 'utf8')
    assert.match(daily, /loadDatabaseHoursAdvice\(\)/)
    assert.match(daily, /databaseHours: hoursAdvice && hoursAdvice\.level !== 'ok' \? hoursAdvice\.short : undefined/)
    const server = readFileSync('lib/database-hours-server.ts', 'utf8')
    assert.match(server, /catch \{\s*return null/)
    assert.match(readFileSync('lib/launch-facts.ts', 'utf8'), /databaseHours: hoursAdvice\?\.short/)
  })
})
