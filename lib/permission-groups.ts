import type { Permission } from '@/lib/permissions'

// How permissions are shown when building a role in Users & roles: one row per area, with a
// "can see" and (where it exists) a "can change" box. Client-safe (no db).
export type PermissionArea = { key: string; label: string; hint?: string; view?: Permission; manage?: Permission; extra?: { permission: Permission; label: string }[] }
export type PermissionSection = { title: string; areas: PermissionArea[] }

export const PERMISSION_SECTIONS: PermissionSection[] = [
  { title: 'Orders', areas: [
    { key: 'orders', label: 'Orders', view: 'orders.view', manage: 'orders.manage', extra: [{ permission: 'orders.refund', label: 'Give refunds' }] },
    { key: 'draftOrders', label: 'Draft orders & invoices', view: 'draftOrders.view', manage: 'draftOrders.manage' },
    { key: 'fulfillments', label: 'Shipping out orders', view: 'fulfillments.view', manage: 'fulfillments.manage' },
    { key: 'returns', label: 'Returns', view: 'returns.view', manage: 'returns.manage' },
    { key: 'orderEdits', label: 'Order edits', view: 'orderEdits.view', manage: 'orderEdits.manage' },
    { key: 'abandoned', label: 'Abandoned checkouts', view: 'abandonedCheckouts.view', manage: 'abandonedCheckouts.manage' },
  ] },
  { title: 'Products & stock', areas: [
    { key: 'products', label: 'Products', view: 'products.view', manage: 'products.manage' },
    { key: 'collections', label: 'Collections', view: 'collections.view', manage: 'collections.manage' },
    { key: 'inventory', label: 'Inventory', view: 'inventory.view', manage: 'inventory.manage' },
    { key: 'transfers', label: 'Stock transfers', view: 'transfers.view', manage: 'transfers.manage' },
    { key: 'purchaseOrders', label: 'Purchase orders', view: 'purchaseOrders.view', manage: 'purchaseOrders.manage' },
    { key: 'metafields', label: 'Custom product fields', view: 'metafields.view', manage: 'metafields.manage' },
  ] },
  { title: 'Customers', areas: [
    { key: 'customers', label: 'Customers', view: 'customers.view', manage: 'customers.manage' },
    { key: 'segments', label: 'Customer segments', view: 'customerSegments.view', manage: 'customerSegments.manage' },
    { key: 'tags', label: 'Customer tags', view: 'customerTags.view', manage: 'customerTags.manage' },
    { key: 'credit', label: 'Store credit & coins', view: 'storeCredit.view', manage: 'storeCredit.manage' },
    { key: 'reviews', label: 'Reviews', view: 'reviews.view', manage: 'reviews.manage' },
  ] },
  { title: 'Marketing', areas: [
    { key: 'coupons', label: 'Discounts', view: 'coupons.view', manage: 'coupons.manage' },
    { key: 'giftCards', label: 'Gift cards', view: 'giftCards.view', manage: 'giftCards.manage' },
  ] },
  { title: 'Online store', areas: [
    { key: 'themes', label: 'Theme & design', view: 'themes.view', manage: 'themes.manage' },
    { key: 'content', label: 'Pages, blog & policies', view: 'content.view', manage: 'content.manage' },
    { key: 'navigation', label: 'Menus', view: 'navigation.view', manage: 'navigation.manage' },
    { key: 'media', label: 'Files & images', view: 'media.view', manage: 'media.manage' },
    { key: 'channels', label: 'Sales channels', view: 'salesChannels.view', manage: 'salesChannels.manage' },
  ] },
  { title: 'Reports', areas: [
    { key: 'dashboard', label: 'Dashboard', view: 'dashboard.view' },
    { key: 'analytics', label: 'Analytics', view: 'analytics.view' },
    { key: 'reports', label: 'Reports', view: 'reports.view' },
    { key: 'activity', label: 'Staff activity log', view: 'activity.view' },
  ] },
  { title: 'Store setup', areas: [
    { key: 'shipping', label: 'Shipping & delivery', view: 'shipping.view', manage: 'shipping.manage' },
    { key: 'tax', label: 'Taxes', view: 'tax.view', manage: 'tax.manage' },
    { key: 'settings', label: 'Settings', hint: 'Payments, store details, checkout', view: 'settings.view', manage: 'settings.manage' },
    { key: 'apiCredentials', label: 'API keys', view: 'apiCredentials.view', manage: 'apiCredentials.manage' },
    { key: 'users', label: 'See staff list', hint: 'Adding, editing and removing staff stays with the owner (super admin)', view: 'users.view' },
  ] },
]

// Built-in roles, described for the Roles tab.
export const BUILT_IN_ROLES: { key: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'SUPPORT' | 'EDITOR'; name: string; description: string }[] = [
  { key: 'SUPER_ADMIN', name: 'Owner (super admin)', description: 'Everything, including staff accounts and roles.' },
  { key: 'ADMIN', name: 'Admin', description: 'Everything except staff accounts and store settings.' },
  { key: 'MANAGER', name: 'Manager', description: 'Day-to-day running: orders, products, customers, marketing.' },
  { key: 'SUPPORT', name: 'Customer support', description: 'Orders, returns, customers and reviews.' },
  { key: 'EDITOR', name: 'Content editor', description: 'Products, collections, pages, theme and menus.' },
]

export function builtInRoleName(role: string) {
  return BUILT_IN_ROLES.find(r => r.key === role)?.name || role
}
