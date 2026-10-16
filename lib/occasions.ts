// Marketing > Occasions: Mother's Day, Christmas, Eid... The store shows "Order by Friday 20
// March to receive it for Mother's Day" on the home page, product pages and the cart, from the
// day you choose until the last day to order, then hides it by itself. Kept as one setting.
// Dates are days ("2027-03-21"), read in the shopper's own day (the store's customers are local).

export const OCCASIONS_KEY = 'marketing.occasions'
export const MAX_OCCASIONS = 30

export type Occasion = { id: string; name: string; nameAr: string; date: string; orderBy: string; showFrom: string; link: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const validDay = (key: string) => DAY.test(key) && !Number.isNaN(Date.parse(`${key}T00:00:00Z`)) && new Date(`${key}T00:00:00Z`).toISOString().slice(0, 10) === key
export const addDays = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export const dayKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

// A store link ("/shop", "/collections/gifts") or nothing; never another website.
export const cleanLink = (value: unknown) => { const v = text(value, 200); return /^\/(?!\/)[^\s]*$/.test(v) ? v : '' }

// What's wrong with an occasion as typed in the admin, or ''.
export function occasionError(o: Pick<Occasion, 'name' | 'date' | 'orderBy' | 'showFrom'>) {
  if (!text(o.name, 60)) return 'Write the occasion\'s name'
  if (!validDay(o.date)) return `${o.name}: choose the day of the occasion`
  if (!validDay(o.orderBy)) return `${o.name}: choose the last day to order`
  if (o.orderBy > o.date) return `${o.name}: the last day to order must be on or before the occasion`
  if (!validDay(o.showFrom)) return `${o.name}: choose when the message starts showing`
  if (o.showFrom > o.orderBy) return `${o.name}: the message must start showing before the last day to order`
  return ''
}

export function readOccasions(value: string | null | undefined): Occasion[] {
  let raw: unknown = []
  try { raw = JSON.parse(value || '[]') } catch { raw = [] }
  if (!Array.isArray(raw)) return []
  const list: Occasion[] = []
  for (const item of raw as Array<Record<string, unknown>>) {
    const o: Occasion = {
      id: text(item?.id, 40) || `o${list.length + 1}`, name: text(item?.name, 60), nameAr: text(item?.nameAr, 60),
      date: text(item?.date, 10), orderBy: text(item?.orderBy, 10), showFrom: text(item?.showFrom, 10), link: cleanLink(item?.link),
    }
    if (!occasionError(o)) list.push(o)
    if (list.length >= MAX_OCCASIONS) break
  }
  return list.sort((a, b) => a.orderBy.localeCompare(b.orderBy))
}

// Still to come (last day to order not passed), for the store pages to check against their day.
export const upcomingOccasions = (list: Occasion[], todayKey: string) => list.filter(o => o.orderBy >= todayKey)

// The one to show today: showing has started and the last day to order has not passed. When
// two overlap, the one whose last day to order comes first.
export function activeOccasion(list: Occasion[], todayKey: string) {
  return list.filter(o => o.showFrom <= todayKey && todayKey <= o.orderBy).sort((a, b) => a.orderBy.localeCompare(b.orderBy))[0] || null
}

// Ready-made occasions for Lebanon. Ones without a fixed day (Easter, the Eids, back to
// school) come without a date for you to choose. Arabic names are first translations to check.
export const OCCASION_PRESETS: Array<{ name: string; nameAr: string; month?: number; day?: number }> = [
  { name: 'Valentine\'s Day', nameAr: 'عيد الحب', month: 2, day: 14 },
  { name: 'Teachers\' Day', nameAr: 'عيد المعلم', month: 3, day: 9 },
  { name: 'Mother\'s Day', nameAr: 'عيد الأم', month: 3, day: 21 },
  { name: 'Easter', nameAr: 'عيد الفصح' },
  { name: 'Eid al-Fitr', nameAr: 'عيد الفطر' },
  { name: 'Eid al-Adha', nameAr: 'عيد الأضحى' },
  { name: 'Father\'s Day', nameAr: 'عيد الأب', month: 6, day: 21 },
  { name: 'Back to school', nameAr: 'العودة إلى المدرسة' },
  { name: 'Christmas', nameAr: 'عيد الميلاد', month: 12, day: 25 },
  { name: 'New Year', nameAr: 'رأس السنة', month: 1, day: 1 },
]

// The next time a fixed-day occasion comes (this year, or next year when it has passed).
export function nextFixedDate(month: number, day: number, todayKey: string) {
  const year = Number(todayKey.slice(0, 4))
  const key = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return key(year) >= todayKey ? key(year) : key(year + 1)
}

// Defaults when only the day is chosen: order up to 2 days before, shown for 2 weeks before that.
export function defaultsFor(date: string) {
  const orderBy = addDays(date, -2)
  return { orderBy, showFrom: addDays(orderBy, -14) }
}
