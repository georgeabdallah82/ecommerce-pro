// Admin > Launch checklist: one page that shows what is ready and what is still missing before
// the store opens to visitors. Most items tick themselves from the store's own settings; the few
// the store cannot see (2-step on the owner's other accounts, a test order) are ticked by hand.

export type ItemStatus = 'ok' | 'todo' | 'warn'
export type ChecklistItem = {
  id: string
  group: 'before' | 'after'
  title: string
  status: ItemStatus
  detail: string
  // Where to fix it (an admin page) and what to press there.
  href?: string
  fix?: string
  // Ticked by hand (the store cannot see it).
  manual?: boolean
}

export type LaunchFacts = {
  storeName: string
  logoUrl: string
  contactPhone: string
  whatsappNumber: string
  codOn: boolean
  cardOn: boolean
  freeShippingThreshold: number | null
  announcementText: string
  shippingZones: number
  activeProducts: number
  productsWithoutPhoto: number
  productsWithoutPrice: number
  twoStepOn: boolean
  phoneAlertsOn: boolean
  emailConfigured: boolean
  maintenanceOn: boolean
  orderCount: number
  arabicOn: boolean
  socialLinks: number
  adTracking: boolean
  footerText: string
  manual: Record<string, string>
  // The free database hours in one line (lib/database-hours.ts), when the daily check can be read.
  databaseHours?: string
}

// The Settings key holding the ticks: { "<id>": "<date ticked>" }.
export const LAUNCH_MANUAL_KEY = 'launch.checklist'

export const MANUAL_ITEMS = [
  { id: 'accounts2fa', group: 'before', title: '2-step verification on your other accounts', detail: 'Turn it on for Gmail, GitHub, Cloudflare, Neon, Resend and where you bought the domain. If someone takes one of these over, they can take the store.' },
  { id: 'testorder', group: 'before', title: 'One test order, followed to the end', detail: 'Order from your phone, confirm it, send it to a driver, mark it delivered. Check the emails, the WhatsApp message and the notification on your phone.' },
  { id: 'dbplan', group: 'before', title: 'Database plan chosen for real visitors', detail: 'The free database plan includes 100 hours a month. A store with visitors all day uses about 6 hours a day, so the free hours would be gone in about two weeks and the store would stop until the month renews. Move the database to Neon\'s pay-as-you-go plan (Neon > Billing) before you launch, then tick this.', href: '/admin/website-status', fix: 'Website status' },
  { id: 'backup', group: 'before', title: 'Last night\'s backup worked', detail: 'Open Website status and check that the backup ran.', href: '/admin/website-status', fix: 'Website status' },
  { id: 'searchconsole', group: 'after', title: 'Google Search Console', detail: 'Free, 5 minutes: Google shows your products faster. Steps are in the guide.' },
  { id: 'instagramshop', group: 'after', title: 'Instagram Shop', detail: 'Show your products as a shop on Instagram. Steps are in the guide.' },
] as const

export const MANUAL_IDS: string[] = MANUAL_ITEMS.map(item => item.id)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Dollar amounts a message mentions: "$50", "50$", "50 USD", "50 dollars".
export function mentionedAmounts(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(?:[$\u20ac\u00a3]\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:\$|usd\b|dollars?\b))/gi)) {
    const value = Number((m[1] || m[2]).replace(',', '.'))
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

// The top bar promises free delivery over an amount: it has to be the amount the store really
// uses (Settings > Checkout), or a customer at $49.50 is told "free" and then pays for delivery.
export function topBarMismatch(text: string, threshold: number | null) {
  if (!threshold || !/free/i.test(text)) return null
  const amounts = mentionedAmounts(text)
  // A single amount is shown as the store's real one automatically (lib/topbar-amount.ts); only
  // messages with several amounts, none of them right, still need a person to fix them.
  if (amounts.length < 2 || amounts.includes(threshold)) return null
  return amounts[0]
}

const DEFAULT_NAMES = new Set(['', 'your brand', 'our store', 'store'])

export function buildChecklist(f: LaunchFacts): { items: ChecklistItem[]; before: { done: number; total: number }; ready: boolean } {
  const done = (id: string) => Boolean(f.manual[id])
  const items: ChecklistItem[] = []

  items.push(
    DEFAULT_NAMES.has(f.storeName.trim().toLowerCase()) || !f.logoUrl
      ? { id: 'brand', group: 'before', title: 'Store name and logo', status: 'todo', detail: !f.logoUrl ? 'No logo yet.' : 'The store still has the placeholder name.', href: '/admin/online-store/theme-editor', fix: 'Theme editor › Theme › Branding' }
      : { id: 'brand', group: 'before', title: 'Store name and logo', status: 'ok', detail: f.storeName.trim() },
  )

  items.push(
    f.contactPhone.trim() || f.whatsappNumber.trim()
      ? { id: 'contact', group: 'before', title: 'Phone / WhatsApp number for customers', status: 'ok', detail: (f.contactPhone || f.whatsappNumber).trim() }
      : { id: 'contact', group: 'before', title: 'Phone / WhatsApp number for customers', status: 'todo', detail: 'Customers need a number to reach you. It also goes in your policies.', href: '/admin/settings', fix: 'Settings › General' },
  )

  const missing = f.productsWithoutPhoto + f.productsWithoutPrice
  items.push(
    !f.activeProducts
      ? { id: 'products', group: 'before', title: 'Products ready to sell', status: 'todo', detail: 'No active product yet.', href: '/admin/products', fix: 'Products' }
      : missing
        ? { id: 'products', group: 'before', title: 'Products ready to sell', status: 'warn', detail: [f.productsWithoutPhoto ? `${plural(f.productsWithoutPhoto, 'product')} without a photo` : '', f.productsWithoutPrice ? `${plural(f.productsWithoutPrice, 'product')} with no price` : ''].filter(Boolean).join(' · '), href: '/admin/products', fix: 'Products' }
        : { id: 'products', group: 'before', title: 'Products ready to sell', status: 'ok', detail: `${plural(f.activeProducts, 'active product')}, all with a photo and a price` },
  )

  items.push(
    f.shippingZones
      ? { id: 'delivery', group: 'before', title: 'Delivery prices', status: 'ok', detail: `${plural(f.shippingZones, 'delivery zone')} with a price` }
      : { id: 'delivery', group: 'before', title: 'Delivery prices', status: 'todo', detail: 'No delivery zone with a price. Checkout falls back to a flat $5.', href: '/admin/shipping', fix: 'Shipping' },
  )

  items.push(
    f.codOn || f.cardOn
      ? { id: 'payments', group: 'before', title: 'A way to pay', status: 'ok', detail: [f.codOn ? 'Cash on delivery' : '', f.cardOn ? 'Card' : ''].filter(Boolean).join(' · ') }
      : { id: 'payments', group: 'before', title: 'A way to pay', status: 'todo', detail: 'Cash on delivery and card are both off: nobody can order.', href: '/admin/settings', fix: 'Settings › Payments' },
  )

  const wrong = topBarMismatch(f.announcementText, f.freeShippingThreshold)
  items.push(
    wrong != null
      ? { id: 'topbar', group: 'before', title: 'Top bar matches your free-delivery amount', status: 'warn', detail: `The top bar says $${wrong}, but free delivery starts at $${f.freeShippingThreshold} (Settings › Checkout). Make them the same.`, href: '/admin/online-store/theme-editor', fix: 'Theme editor › Home › Announcement bar' }
      : { id: 'topbar', group: 'before', title: 'Top bar matches your free-delivery amount', status: 'ok', detail: f.freeShippingThreshold ? `Free delivery from $${f.freeShippingThreshold}` : 'No free-delivery amount to compare' },
  )

  items.push(
    f.emailConfigured
      ? { id: 'email', group: 'before', title: 'Order emails can be sent', status: 'ok', detail: 'Email sending is set up' }
      : { id: 'email', group: 'before', title: 'Order emails can be sent', status: 'todo', detail: 'Email sending is not set up, so customers get no confirmation.', href: '/admin/website-status', fix: 'Website status' },
  )

  items.push(
    f.phoneAlertsOn
      ? { id: 'alerts', group: 'before', title: 'New-order alerts on your phone', status: 'ok', detail: 'Notifications are on for your account' }
      : { id: 'alerts', group: 'before', title: 'New-order alerts on your phone', status: 'todo', detail: 'Turn them on from your phone so a new order buzzes you.', href: '/admin/settings', fix: 'Settings › Notifications' },
  )

  items.push(
    f.twoStepOn
      ? { id: 'twostep', group: 'before', title: '2-step login for your admin', status: 'ok', detail: 'On for your account' }
      : { id: 'twostep', group: 'before', title: '2-step login for your admin', status: 'todo', detail: 'A code from your phone as well as the password. Protects your orders and customers\' numbers.', href: '/admin/settings', fix: 'Settings › Security & access' },
  )

  for (const m of MANUAL_ITEMS.filter(item => item.group === 'before')) {
    items.push({ id: m.id, group: 'before', title: m.title, status: done(m.id) ? 'ok' : 'todo', detail: m.id === 'dbplan' && f.databaseHours ? `${m.detail} Right now: ${f.databaseHours}.` : m.detail, manual: true, ...('href' in m ? { href: m.href, fix: m.fix } : {}) })
  }

  items.push(
    f.orderCount
      ? { id: 'testdata', group: 'before', title: 'Test orders cleared', status: 'warn', detail: `${plural(f.orderCount, 'order')} in the store, left over from testing. Tell your developer "ready to launch": they clear them after taking a backup.` }
      : { id: 'testdata', group: 'before', title: 'Test orders cleared', status: 'ok', detail: 'No orders in the store' },
  )

  // The last step.
  items.push(
    f.maintenanceOn
      ? { id: 'open', group: 'before', title: 'Open the store to visitors', status: 'todo', detail: 'Visitors still see the "We\'ll be right back" page. Turn maintenance mode off as the very last step.', href: '/admin/settings', fix: 'Settings › Maintenance' }
      : { id: 'open', group: 'before', title: 'Open the store to visitors', status: 'ok', detail: 'The store is open' },
  )

  for (const m of MANUAL_ITEMS.filter(item => item.group === 'after')) items.push({ id: m.id, group: 'after', title: m.title, status: done(m.id) ? 'ok' : 'todo', detail: m.detail, manual: true })
  items.push(
    f.arabicOn
      ? { id: 'arabic', group: 'after', title: 'Arabic version', status: 'ok', detail: 'Customers can switch the store to Arabic' }
      : { id: 'arabic', group: 'after', title: 'Arabic version', status: 'todo', detail: 'Most customers read Arabic. Switch it on when you have checked the translations.', href: '/admin/online-store/theme-editor', fix: 'Theme editor › Theme › Languages' },
    f.socialLinks
      ? { id: 'social', group: 'after', title: 'Instagram, Facebook and TikTok links', status: 'ok', detail: `${plural(f.socialLinks, 'link')} in the footer` }
      : { id: 'social', group: 'after', title: 'Instagram, Facebook and TikTok links', status: 'todo', detail: 'Add them so visitors find you.', href: '/admin/online-store/theme-editor', fix: 'Theme editor › Theme › Social links' },
    f.footerText.trim()
      ? { id: 'footer', group: 'after', title: 'A line under the logo in the footer', status: 'ok', detail: f.footerText.trim() }
      : { id: 'footer', group: 'after', title: 'A line under the logo in the footer', status: 'todo', detail: 'It is empty now. One short sentence about what you sell.', href: '/admin/online-store/theme-editor', fix: 'Theme editor › Theme › Footer' },
    f.adTracking
      ? { id: 'tracking', group: 'after', title: 'Ad tracking (Meta Pixel or Google Analytics)', status: 'ok', detail: 'Connected' }
      : { id: 'tracking', group: 'after', title: 'Ad tracking (Meta Pixel or Google Analytics)', status: 'todo', detail: 'Needed to see which ads bring orders.', href: '/admin/settings', fix: 'Settings › Tracking' },
  )

  const before = items.filter(i => i.group === 'before')
  const total = before.length
  const doneCount = before.filter(i => i.status === 'ok').length
  return { items, before: { done: doneCount, total }, ready: doneCount === total }
}
