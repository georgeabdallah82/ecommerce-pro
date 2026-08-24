import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'

const capabilities = [
  { key: 'catalog.products', name: 'Products', state: 'ready', scope: ['products', 'variants', 'media', 'SEO', 'metafields'] },
  { key: 'catalog.categories', name: 'Categories', state: 'ready', scope: ['hierarchy', 'slugs', 'product assignment'] },
  { key: 'catalog.collections', name: 'Collections', state: 'ready', scope: ['CRUD', 'product ordering', 'storefront'] },
  { key: 'inventory.core', name: 'Inventory', state: 'ready', scope: ['on-hand', 'reserved', 'available', 'adjustments', 'movement history', 'low-stock'] },
  { key: 'orders.core', name: 'Orders', state: 'ready', scope: ['checkout orders', 'manual orders', 'status lifecycle', 'tracking', 'notes', 'audit'] },
  { key: 'orders.refunds', name: 'Refunds', state: 'ready', scope: ['partial', 'full', 'over-refund protection'] },
  { key: 'orders.returns', name: 'Returns', state: 'ready', scope: ['return workflow', 'restock', 'refund accounting'] },
  { key: 'customers', name: 'Customers', state: 'ready', scope: ['profiles', 'addresses', 'orders', 'reviews', 'activation'] },
  { key: 'discounts', name: 'Discounts', state: 'ready', scope: ['codes', 'percentage', 'fixed', 'free shipping', 'usage windows'] },
  { key: 'shipping', name: 'Shipping', state: 'ready', scope: ['zones', 'rates', 'free-above thresholds', 'estimated days'] },
  { key: 'payments', name: 'Payments', state: process.env.PAYMENT_PROVIDER && process.env.PAYMENT_PROVIDER !== 'manual' ? 'configured' : 'setup-required', scope: ['provider abstraction', 'webhook status', 'COD/manual payment'] },
  { key: 'notifications.order-alerts', name: 'Order alerts', state: process.env.VAPID_PRIVATE_KEY && (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) ? 'configured' : 'setup-required', scope: ['web push', 'background notifications', 'test alert'] },
  { key: 'online-store.theme', name: 'Theme Studio', state: 'ready', scope: ['templates', 'sections', 'global design', 'responsive preview', 'revisions'] },
  { key: 'online-store.navigation', name: 'Navigation', state: 'ready', scope: ['menus', 'nested items', 'resource links'] },
  { key: 'content', name: 'Content', state: 'ready', scope: ['pages', 'blogs', 'homepage blocks'] },
  { key: 'media', name: 'Media library', state: 'ready', scope: ['assets', 'local uploads', 'metadata'] },
  { key: 'analytics', name: 'Reports & analytics', state: 'ready', scope: ['revenue', 'orders', 'AOV', 'items sold', 'customers', 'low stock'] },
  { key: 'security', name: 'Security & audit', state: 'ready', scope: ['RBAC', 'audit log', 'security headers', 'webhook secrets'] },
]

export async function GET() {
  try {
    await requirePermission('settings.view')
    const configured = capabilities.filter(c => c.state === 'configured' || c.state === 'ready').length
    return json({ total: capabilities.length, configured, setupRequired: capabilities.length - configured, capabilities })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}
