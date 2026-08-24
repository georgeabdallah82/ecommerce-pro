import { Role } from '@prisma/client'

export type Permission =
  | 'dashboard.view'
  | 'products.view' | 'products.manage'
  | 'inventory.view' | 'inventory.manage'
  | 'locations.view' | 'locations.manage'
  | 'transfers.view' | 'transfers.manage'
  | 'purchaseOrders.view' | 'purchaseOrders.manage'
  | 'orders.view' | 'orders.manage' | 'orders.refund'
  | 'draftOrders.view' | 'draftOrders.manage'
  | 'fulfillments.view' | 'fulfillments.manage'
  | 'returns.view' | 'returns.manage'
  | 'orderEdits.view' | 'orderEdits.manage'
  | 'customers.view' | 'customers.manage'
  | 'customerSegments.view' | 'customerSegments.manage'
  | 'customerTags.view' | 'customerTags.manage'
  | 'storeCredit.view' | 'storeCredit.manage'
  | 'categories.view' | 'categories.manage'
  | 'collections.view' | 'collections.manage'
  | 'coupons.view' | 'coupons.manage'
  | 'giftCards.view' | 'giftCards.manage'
  | 'reviews.view' | 'reviews.manage'
  | 'users.view' | 'users.manage'
  | 'activity.view'
  | 'shipping.view' | 'shipping.manage'
  | 'content.view' | 'content.manage'
  | 'media.view' | 'media.manage'
  | 'navigation.view' | 'navigation.manage'
  | 'themes.view' | 'themes.manage'
  | 'metafields.view' | 'metafields.manage'
  | 'salesChannels.view' | 'salesChannels.manage'
  | 'webhooks.view' | 'webhooks.manage'
  | 'apiCredentials.view' | 'apiCredentials.manage'
  | 'abandonedCheckouts.view' | 'abandonedCheckouts.manage'
  | 'analytics.view'
  | 'reports.view'
  | 'settings.view' | 'settings.manage'

const all: Permission[] = [
  'dashboard.view',
  'products.view', 'products.manage',
  'inventory.view', 'inventory.manage',
  'locations.view', 'locations.manage',
  'transfers.view', 'transfers.manage',
  'purchaseOrders.view', 'purchaseOrders.manage',
  'orders.view', 'orders.manage', 'orders.refund',
  'draftOrders.view', 'draftOrders.manage',
  'fulfillments.view', 'fulfillments.manage',
  'returns.view', 'returns.manage',
  'orderEdits.view', 'orderEdits.manage',
  'customers.view', 'customers.manage',
  'customerSegments.view', 'customerSegments.manage',
  'customerTags.view', 'customerTags.manage',
  'storeCredit.view', 'storeCredit.manage',
  'categories.view', 'categories.manage',
  'collections.view', 'collections.manage',
  'coupons.view', 'coupons.manage',
  'giftCards.view', 'giftCards.manage',
  'reviews.view', 'reviews.manage',
  'users.view', 'users.manage',
  'activity.view',
  'shipping.view', 'shipping.manage',
  'content.view', 'content.manage',
  'media.view', 'media.manage',
  'navigation.view', 'navigation.manage',
  'themes.view', 'themes.manage',
  'metafields.view', 'metafields.manage',
  'salesChannels.view', 'salesChannels.manage',
  'webhooks.view', 'webhooks.manage',
  'apiCredentials.view', 'apiCredentials.manage',
  'abandonedCheckouts.view', 'abandonedCheckouts.manage',
  'analytics.view',
  'reports.view',
  'settings.view', 'settings.manage'
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: all,
  ADMIN: all.filter(p => !['settings.manage', 'users.view', 'users.manage'].includes(p)),
  MANAGER: all.filter(p => ![
    'settings.manage', 'users.view', 'users.manage', 'activity.view',
    'media.manage', 'content.manage', 'themes.manage', 'navigation.manage',
    'webhooks.manage', 'apiCredentials.manage'
  ].includes(p)),
  SUPPORT: [
    'dashboard.view',
    'orders.view', 'orders.manage',
    'draftOrders.view', 'draftOrders.manage',
    'fulfillments.view', 'fulfillments.manage',
    'returns.view', 'returns.manage',
    'customers.view', 'customers.manage',
    'customerSegments.view', 'customerTags.view',
    'storeCredit.view',
    'reviews.view', 'reviews.manage'
  ],
  EDITOR: [
    'dashboard.view',
    'products.view', 'products.manage',
    'categories.view', 'categories.manage',
    'collections.view', 'collections.manage',
    'reviews.view', 'reviews.manage',
    'content.view', 'content.manage',
    'media.view', 'media.manage',
    'navigation.view', 'navigation.manage',
    'themes.view', 'themes.manage',
    'metafields.view', 'metafields.manage'
  ],
  CUSTOMER: []
}

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
