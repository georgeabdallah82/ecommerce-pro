import { db } from '@/lib/prisma'

export type HealthSeverity = 'ok' | 'warning' | 'critical'
export type HealthCheck = { key: string; label: string; severity: HealthSeverity; message: string; count?: number; meta?: Record<string, unknown> }

function severityFor(ok: boolean, critical = false): HealthSeverity {
  if (ok) return 'ok'
  return critical ? 'critical' : 'warning'
}

export async function runPlatformHealth(): Promise<{ status: HealthSeverity; checks: HealthCheck[]; generatedAt: string }> {
  const checks: HealthCheck[] = []

  try {
    await db.$queryRaw`SELECT 1`
    checks.push({ key: 'database', label: 'Database', severity: 'ok', message: 'PostgreSQL is reachable.' })
  } catch (error) {
    checks.push({ key: 'database', label: 'Database', severity: 'critical', message: error instanceof Error ? error.message : 'Database is unreachable.' })
  }

  const [users, staff, products, activeProducts, variants, inventory, orders, pendingOrders, customers, coupons, shippingZones, shippingRates, themes, navigationMenus, pages, blogPosts, media, audits] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: { not: 'CUSTOMER' }, isActive: true } }),
    db.product.count(),
    db.product.count({ where: { status: 'ACTIVE' } }),
    db.productVariant.count(),
    db.inventoryItem.findMany({ select: { quantity: true, reserved: true, lowStockThreshold: true } }),
    db.order.count(),
    db.order.count({ where: { status: 'PENDING' } }),
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.coupon.count({ where: { isActive: true } }),
    db.shippingZone.count({ where: { isActive: true } }),
    db.shippingRate.count({ where: { isActive: true } }),
    db.theme.count(),
    db.navigationMenu.count(),
    db.page.count(),
    db.blogPost.count(),
    db.mediaAsset.count(),
    db.auditLog.count(),
  ])

  const negativeInventory = inventory.filter(i => i.quantity < 0)
  const overReserved = inventory.filter(i => i.reserved > i.quantity)
  const lowStock = inventory.filter(i => i.quantity - i.reserved <= i.lowStockThreshold)
  const expiredActiveCoupons = await db.coupon.count({ where: { isActive: true, expiresAt: { lt: new Date() } } })
  const activeWithoutPublishDate = await db.product.count({ where: { status: 'ACTIVE', publishedAt: null } })
  const zonesWithoutRates = await db.shippingZone.count({ where: { isActive: true, rates: { none: { isActive: true } } } })

  checks.push({ key: 'auth', label: 'Authentication', severity: severityFor(Boolean(process.env.AUTH_SECRET), true), message: process.env.AUTH_SECRET ? 'AUTH_SECRET is configured.' : 'AUTH_SECRET is missing.' })
  checks.push({ key: 'site-url', label: 'Store URL', severity: severityFor(Boolean(process.env.NEXT_PUBLIC_SITE_URL), false), message: process.env.NEXT_PUBLIC_SITE_URL ? 'NEXT_PUBLIC_SITE_URL is configured.' : 'NEXT_PUBLIC_SITE_URL is not configured.' })
  checks.push({ key: 'staff', label: 'Staff access', severity: severityFor(staff > 0, true), message: staff > 0 ? `${staff} active staff account(s) available.` : 'No active staff account exists.', count: staff })
  checks.push({ key: 'catalog', label: 'Catalog', severity: severityFor(products > 0, false), message: `${products} product(s), ${variants} variant(s), ${activeProducts} active.`, meta: { products, variants, activeProducts } })
  checks.push({ key: 'inventory-negative', label: 'Negative inventory', severity: severityFor(negativeInventory.length === 0, true), message: negativeInventory.length ? `${negativeInventory.length} inventory record(s) have negative stock.` : 'No negative inventory balances.', count: negativeInventory.length })
  checks.push({ key: 'inventory-reserved', label: 'Reservation integrity', severity: severityFor(overReserved.length === 0, true), message: overReserved.length ? `${overReserved.length} inventory record(s) reserve more than on-hand.` : 'Reserved quantities are within on-hand balances.', count: overReserved.length })
  checks.push({ key: 'low-stock', label: 'Stock monitoring', severity: lowStock.length ? 'warning' : 'ok', message: lowStock.length ? `${lowStock.length} inventory record(s) are at or below threshold.` : 'No low-stock records detected.', count: lowStock.length })
  checks.push({ key: 'orders', label: 'Orders', severity: pendingOrders ? 'warning' : 'ok', message: `${orders} total order(s); ${pendingOrders} pending.`, meta: { orders, pendingOrders } })
  checks.push({ key: 'coupons', label: 'Discounts', severity: expiredActiveCoupons ? 'warning' : 'ok', message: expiredActiveCoupons ? `${expiredActiveCoupons} expired coupon(s) are still active.` : `${coupons} active coupon(s); no expired active coupons.`, count: expiredActiveCoupons })
  checks.push({ key: 'shipping', label: 'Shipping', severity: zonesWithoutRates ? 'warning' : 'ok', message: zonesWithoutRates ? `${zonesWithoutRates} active shipping zone(s) have no active rates.` : `${shippingZones} active zone(s), ${shippingRates} active rate(s).`, meta: { shippingZones, shippingRates } })
  checks.push({ key: 'product-publishing', label: 'Publishing integrity', severity: activeWithoutPublishDate ? 'warning' : 'ok', message: activeWithoutPublishDate ? `${activeWithoutPublishDate} active product(s) have no publishedAt timestamp.` : 'Active products have publication timestamps.', count: activeWithoutPublishDate })
  checks.push({ key: 'storefront-content', label: 'Storefront content', severity: pages + blogPosts + media > 0 ? 'ok' : 'warning', message: `${pages} page(s), ${blogPosts} blog post(s), ${media} media asset(s).`, meta: { pages, blogPosts, media } })
  checks.push({ key: 'theme', label: 'Theme system', severity: themes > 0 ? 'ok' : 'warning', message: themes > 0 ? `${themes} theme configuration(s) stored.` : 'No theme configuration exists.' })
  checks.push({ key: 'navigation', label: 'Navigation', severity: navigationMenus > 0 ? 'ok' : 'warning', message: navigationMenus > 0 ? `${navigationMenus} navigation menu(s) configured.` : 'No navigation menus configured.' })
  checks.push({ key: 'customer-base', label: 'Customers', severity: customers > 0 ? 'ok' : 'warning', message: `${customers} customer account(s).`, count: customers })
  checks.push({ key: 'payments', label: 'Payments', severity: process.env.PAYMENT_PROVIDER === 'manual' || !process.env.PAYMENT_PROVIDER ? 'warning' : 'ok', message: process.env.PAYMENT_PROVIDER && process.env.PAYMENT_PROVIDER !== 'manual' ? `Payment provider configured: ${process.env.PAYMENT_PROVIDER}.` : 'Manual/COD payments are active; configure a real gateway before live card payments.' })
  checks.push({ key: 'push', label: 'Order alerts', severity: process.env.VAPID_PRIVATE_KEY && (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) && process.env.VAPID_SUBJECT ? 'ok' : 'warning', message: process.env.VAPID_PRIVATE_KEY && (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) && process.env.VAPID_SUBJECT ? 'Web Push configuration is present.' : 'VAPID configuration is incomplete.' })
  checks.push({ key: 'audit', label: 'Audit trail', severity: audits > 0 ? 'ok' : 'warning', message: `${audits} audit event(s) stored.`, count: audits })

  const status: HealthSeverity = checks.some(c => c.severity === 'critical') ? 'critical' : checks.some(c => c.severity === 'warning') ? 'warning' : 'ok'
  return { status, checks, generatedAt: new Date().toISOString() }
}
