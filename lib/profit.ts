import { parseCsv, parseMoney } from '@/lib/catalog-csv'

// Reports > Profit: what the store actually made over a date range, every figure shown on its
// own so nothing is hidden inside another. Costs the owner hasn't entered (a product's cost,
// delivery or packaging per order) are reported as "not entered", never guessed: the profit
// is then marked as an estimate that is too high, and the page says what is missing.

export type ProfitOrder = {
  status: string
  paymentStatus: string
  paymentMethod: string | null
  currency: string
  grandTotal: number
  taxTotal: number
  shippingTotal: number
  discountTotal: number
  // Successful refunds recorded on the order (refund payment transactions).
  refunded: number
  items: { productId: string; name: string; quantity: number; totalPrice: number }[]
}

export type ProfitSettings = { deliveryCostPerOrder: number | null; packagingCostPerOrder: number | null }
export type AdSpendEntry = { platform: string; amount: number; currency: string }

const COLLECTED = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])

type Part = { orders: number; sales: number; salesExTax: number; productCost: number }
const emptyPart = (): Part => ({ orders: 0, sales: 0, salesExTax: 0, productCost: 0 })

export type MissingCost = { productId: string; name: string; units: number; sales: number }

// One product's share: its sales after discounts, without tax and delivery, against what the
// units cost. Delivery, packaging, ads and running costs are for the whole store and are not
// split per product. `cost` is null when the product's cost is not entered.
export type ProductProfit = { productId: string; name: string; units: number; freeUnits: number; sales: number; cost: number | null; profit: number | null; margin: number | null }

export type ProfitReport = {
  currency: string
  ordersPlaced: number
  otherCurrencyOrders: number
  grossOrderValue: number
  cancelled: { orders: number; value: number }
  refunded: number
  netSales: number
  taxIncluded: number
  shippingCharged: number
  discounts: number
  collected: Part
  unpaidCod: Part
  unpaidOther: Part
  productCost: { total: number; missing: MissingCost[]; missingSales: number }
  delivery: { perOrder: number | null; orders: number; total: number | null }
  packaging: { perOrder: number | null; orders: number; total: number | null }
  adSpend: { total: number; byPlatform: { platform: string; total: number }[]; entries: number; otherCurrency: number }
  // The store's running costs in these dates (lib/expenses.ts): rent, salaries...
  expenses: { total: number; lines: { id: string; name: string; monthly: boolean; amount: number }[] }
  byProduct: ProductProfit[]
  profit: { collectedSoFar: number; ifUnpaidCollected: number }
  estimated: boolean
  missing: string[]
}

export function computeProfit(orders: ProfitOrder[], costs: Map<string, number | null>, settings: ProfitSettings, adSpend: AdSpendEntry[], currency: string, expenses: ProfitReport['expenses'] = { total: 0, lines: [] }): ProfitReport {
  const inCurrency = orders.filter(o => o.currency === currency)
  const report = {
    grossOrderValue: 0, cancelledOrders: 0, cancelledValue: 0, refunded: 0, taxIncluded: 0, shippingCharged: 0, discounts: 0,
    collected: emptyPart(), unpaidCod: emptyPart(), unpaidOther: emptyPart(),
  }
  const missing = new Map<string, MissingCost>()
  const perProduct = new Map<string, { name: string; units: number; freeUnits: number; sales: number; cost: number; costMissing: boolean }>()
  let productCost = 0
  let missingSales = 0
  for (const order of inCurrency) {
    report.grossOrderValue += order.grandTotal
    if (order.status === 'CANCELLED') { report.cancelledOrders += 1; report.cancelledValue += order.grandTotal; continue }
    const net = Math.max(0, order.grandTotal - Math.max(0, order.refunded))
    report.refunded += order.grandTotal - net
    // Fully refunded: no sale left, and the goods came back (or never left).
    if (net === 0) continue
    // Tax is the government's money, not the store's: the share left after refunds.
    const tax = order.grandTotal > 0 ? Math.round(order.taxTotal * net / order.grandTotal) : 0
    report.taxIncluded += tax
    report.shippingCharged += order.shippingTotal
    report.discounts += order.discountTotal
    let cost = 0
    // The goods' share of what was paid: after discounts and refunds, without tax and delivery,
    // shared between the lines by their price.
    const itemsTotal = order.items.reduce((sum, i) => sum + Math.max(0, i.totalPrice), 0)
    const goodsShare = itemsTotal > 0 ? Math.max(0, net - tax - order.shippingTotal) / itemsTotal : 0
    for (const item of order.items) {
      const line = perProduct.get(item.productId) || { name: item.name, units: 0, freeUnits: 0, sales: 0, cost: 0, costMissing: false }
      line.units += item.quantity
      if (item.totalPrice <= 0) line.freeUnits += item.quantity
      line.sales += Math.max(0, item.totalPrice) * goodsShare
      const lineUnit = costs.get(item.productId)
      if (lineUnit && lineUnit > 0) line.cost += lineUnit * item.quantity
      else line.costMissing = true
      perProduct.set(item.productId, line)
      const unit = costs.get(item.productId)
      if (unit && unit > 0) { cost += unit * item.quantity; continue }
      const entry = missing.get(item.productId) || { productId: item.productId, name: item.name, units: 0, sales: 0 }
      entry.units += item.quantity
      entry.sales += item.totalPrice
      missing.set(item.productId, entry)
      missingSales += item.totalPrice
    }
    productCost += cost
    const part = COLLECTED.has(order.paymentStatus) ? report.collected : order.paymentMethod === 'COD' ? report.unpaidCod : report.unpaidOther
    part.orders += 1
    part.sales += net
    part.salesExTax += net - tax
    part.productCost += cost
  }

  const counted = report.collected.orders + report.unpaidCod.orders + report.unpaidOther.orders
  const perOrder = (value: number | null, orders: number) => ({ perOrder: value, orders, total: value == null ? null : value * orders })
  const delivery = perOrder(settings.deliveryCostPerOrder, counted)
  const packaging = perOrder(settings.packagingCostPerOrder, counted)
  const perOrderCosts = (settings.deliveryCostPerOrder || 0) + (settings.packagingCostPerOrder || 0)

  const spend = adSpend.filter(a => a.currency === currency)
  const byPlatform = new Map<string, number>()
  for (const entry of spend) byPlatform.set(entry.platform, (byPlatform.get(entry.platform) || 0) + entry.amount)
  const adTotal = spend.reduce((sum, a) => sum + a.amount, 0)

  const unpaid = [report.unpaidCod, report.unpaidOther]
  const collectedProfit = report.collected.salesExTax - report.collected.productCost - perOrderCosts * report.collected.orders - adTotal - expenses.total
  const unpaidProfit = unpaid.reduce((sum, p) => sum + p.salesExTax - p.productCost - perOrderCosts * p.orders, 0)

  const missingNotes: string[] = []
  if (missing.size) missingNotes.push(`Product cost not entered for ${missing.size} product${missing.size === 1 ? '' : 's'} sold`)
  if (settings.deliveryCostPerOrder == null) missingNotes.push('Delivery cost per order not entered')
  if (settings.packagingCostPerOrder == null) missingNotes.push('Packaging cost per order not entered')
  if (!spend.length) missingNotes.push('No ad spend entered for these dates')

  return {
    currency,
    ordersPlaced: inCurrency.length,
    otherCurrencyOrders: orders.length - inCurrency.length,
    grossOrderValue: report.grossOrderValue,
    cancelled: { orders: report.cancelledOrders, value: report.cancelledValue },
    refunded: report.refunded,
    netSales: report.collected.sales + report.unpaidCod.sales + report.unpaidOther.sales,
    taxIncluded: report.taxIncluded,
    shippingCharged: report.shippingCharged,
    discounts: report.discounts,
    collected: report.collected,
    unpaidCod: report.unpaidCod,
    unpaidOther: report.unpaidOther,
    productCost: { total: productCost, missing: [...missing.values()].sort((a, b) => b.sales - a.sales), missingSales },
    delivery,
    packaging,
    expenses,
    byProduct: [...perProduct].map(([productId, p]) => {
      const sales = Math.round(p.sales)
      const profit = p.costMissing ? null : sales - p.cost
      return { productId, name: p.name, units: p.units, freeUnits: p.freeUnits, sales, cost: p.costMissing ? null : p.cost, profit, margin: profit != null && sales > 0 ? Math.round((profit / sales) * 1000) / 10 : null }
    }).sort((a, b) => (b.profit ?? Number.NEGATIVE_INFINITY) - (a.profit ?? Number.NEGATIVE_INFINITY) || b.sales - a.sales || a.name.localeCompare(b.name)),
    adSpend: { total: adTotal, byPlatform: [...byPlatform].map(([platform, total]) => ({ platform, total })).sort((a, b) => b.total - a.total), entries: spend.length, otherCurrency: adSpend.length - spend.length },
    profit: { collectedSoFar: collectedProfit, ifUnpaidCollected: collectedProfit + unpaidProfit },
    estimated: missingNotes.length > 0,
    missing: missingNotes,
  }
}

// The report's dates, as the Analytics tab picks them: ?start=&end= (whole days, end included)
// or ?days= back from today; whole UTC days, never past the end of today.
export function reportRange(params: URLSearchParams, now: Date) {
  const day = (v: string | null) => { const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const tomorrow = new Date(today.getTime() + 86400000)
  const start = day(params.get('start'))
  const end = day(params.get('end'))
  if (start && end && end >= start) {
    const until = new Date(Math.min(end.getTime() + 86400000, tomorrow.getTime()))
    const since = start < until ? start : new Date(until.getTime() - 86400000)
    return { since, until, days: Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400000)) }
  }
  const n = Number(params.get('days') || 30)
  const days = Number.isFinite(n) ? Math.min(366, Math.max(1, Math.floor(n))) : 30
  return { since: new Date(today.getTime() - (days - 1) * 86400000), until: tomorrow, days }
}

// A cost typed in the settings box: '' means "not entered" (null), never zero.
export function readCostSetting(value: string | null | undefined): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const cents = Number(raw)
  return Number.isInteger(cents) && cents >= 0 ? cents : null
}

// ---- Ad spend: typed in, or imported from a CSV (Meta/TikTok exports or a sheet) ----

export const AD_PLATFORMS = ['Meta', 'TikTok', 'Google', 'Other'] as const

export function normalizePlatform(raw: string | null | undefined) {
  const v = String(raw || '').trim()
  const lower = v.toLowerCase()
  if (!lower) return ''
  if (/facebook|instagram|meta/.test(lower)) return 'Meta'
  if (/tik ?tok/.test(lower)) return 'TikTok'
  if (/google|youtube|adwords/.test(lower)) return 'Google'
  return v.replace(/\s+/g, ' ').slice(0, 40)
}

// Dates as the owner's sheets write them: 2026-10-05, or 5/10/2026 (day first, as in Lebanon)
// unless the file shows otherwise (a 13+ in the second place means month first, as in US exports).
export type DateOrder = 'dmy' | 'mdy'
const ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/
const SLASHED = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/

export function detectDateOrder(values: string[]): DateOrder | 'conflict' {
  let dayFirst = false, monthFirst = false
  for (const v of values) {
    const m = SLASHED.exec(v.trim())
    if (!m) continue
    if (Number(m[1]) > 12) dayFirst = true
    if (Number(m[2]) > 12) monthFirst = true
  }
  if (dayFirst && monthFirst) return 'conflict'
  return monthFirst ? 'mdy' : 'dmy'
}

export function parseSpendDate(raw: string, order: DateOrder = 'dmy'): string | null {
  const v = String(raw || '').trim()
  let y: number, m: number, d: number
  const iso = ISO.exec(v)
  const slashed = SLASHED.exec(v)
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]) }
  else if (slashed) { y = Number(slashed[3]); m = Number(order === 'mdy' ? slashed[1] : slashed[2]); d = Number(order === 'mdy' ? slashed[2] : slashed[1]) }
  else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) return null
  return date.toISOString().slice(0, 10)
}

const header = (h: string) => h.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z]+/g, ' ').trim()
const DATE_HEADERS = ['date', 'day', 'reporting starts', 'reporting start', 'start date', 'by day']
const PLATFORM_HEADERS = ['platform', 'channel', 'source', 'network']
const AMOUNT_HEADERS = ['amount', 'amount spent', 'spend', 'spent', 'cost', 'total spend', 'total cost']

export type SpendRow = { line: number; date: string; platform: string; amount: number }
export type SpendFile = { rows: SpendRow[]; errors: { line: number; message: string }[]; dateOrder: DateOrder }

// Reads a spend sheet: one row per day (or per campaign and day; rows on the same day and
// platform are added up). Rows with no amount, or zero, are left out.
export function readSpendCsv(text: string, defaultPlatform: string): SpendFile {
  const rows = parseCsv(text)
  if (!rows.length) return { rows: [], errors: [{ line: 1, message: 'The file has no rows' }], dateOrder: 'dmy' }
  const headers = Object.keys(rows[0])
  const find = (names: string[]) => headers.find(h => names.includes(header(h)))
  const dateCol = find(DATE_HEADERS)
  const amountCol = find(AMOUNT_HEADERS)
  const platformCol = find(PLATFORM_HEADERS)
  const errors: SpendFile['errors'] = []
  if (!dateCol) errors.push({ line: 1, message: 'No Date column (name it "Date")' })
  if (!amountCol) errors.push({ line: 1, message: 'No Amount column (name it "Amount")' })
  if (errors.length) return { rows: [], errors, dateOrder: 'dmy' }
  const detected = detectDateOrder(rows.map(r => r[dateCol!] || ''))
  if (detected === 'conflict') return { rows: [], errors: [{ line: 1, message: 'Dates are written two different ways (day/month and month/day). Write them like 2026-10-05.' }], dateOrder: 'dmy' }
  const merged = new Map<string, SpendRow>()
  const undated: { line: number; amount: number | null; total: boolean }[] = []
  let datedSum = 0
  rows.forEach((row, index) => {
    const line = index + 2
    const rawAmount = String(row[amountCol!] || '').trim()
    const rawDate = String(row[dateCol!] || '').trim()
    // A day with no spend is not an entry.
    if (!rawAmount) return
    // No date: the totals row exports add (checked below), or a date left out by mistake.
    if (!rawDate) { undated.push({ line, amount: parseMoney(rawAmount), total: /total/i.test(Object.values(row).join(' ')) }); return }
    const date = parseSpendDate(rawDate, detected)
    if (!date) { errors.push({ line, message: `Date "${rawDate.slice(0, 30)}" is not a date (write it like 2026-10-05)` }); return }
    const amount = parseMoney(rawAmount)
    if (amount === null) { errors.push({ line, message: `Amount "${rawAmount.slice(0, 30)}" is not a number` }); return }
    datedSum += amount
    if (amount === 0) return
    const platform = normalizePlatform(platformCol ? row[platformCol] : '') || normalizePlatform(defaultPlatform) || 'Other'
    const key = `${date}|${platform}`
    const existing = merged.get(key)
    if (existing) existing.amount += amount
    else merged.set(key, { line, date, platform, amount })
  })
  for (const row of undated) if (!row.total && row.amount !== datedSum) errors.push({ line: row.line, message: 'The date is missing' })
  errors.sort((a, b) => a.line - b.line)
  return { rows: [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform)), errors, dateOrder: detected }
}
