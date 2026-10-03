import { Role } from '@prisma/client'

export type Permission =
  | 'dashboard.view'
  | 'products.view' | 'products.manage'
  | 'inventory.view' | 'inventory.manage'
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
  | 'collections.view' | 'collections.manage'
  | 'coupons.view' | 'coupons.manage'
  | 'giftCards.view' | 'giftCards.manage'
  | 'reviews.view' | 'reviews.manage'
  | 'users.view' | 'users.manage'
  | 'activity.view'
  | 'shipping.view' | 'shipping.manage'
  | 'tax.view' | 'tax.manage'
  | 'content.view' | 'content.manage'
  | 'media.view' | 'media.manage'
  | 'navigation.view' | 'navigation.manage'
  | 'themes.view' | 'themes.manage'
  | 'metafields.view' | 'metafields.manage'
  | 'salesChannels.view' | 'salesChannels.manage'
  | 'apiCredentials.view' | 'apiCredentials.manage'
  | 'abandonedCheckouts.view' | 'abandonedCheckouts.manage'
  | 'analytics.view'
  | 'reports.view'
  | 'settings.view' | 'settings.manage'

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'products.view', 'products.manage',
  'inventory.view', 'inventory.manage',
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
  'collections.view', 'collections.manage',
  'coupons.view', 'coupons.manage',
  'giftCards.view', 'giftCards.manage',
  'reviews.view', 'reviews.manage',
  'users.view', 'users.manage',
  'activity.view',
  'shipping.view', 'shipping.manage',
  'tax.view', 'tax.manage',
  'content.view', 'content.manage',
  'media.view', 'media.manage',
  'navigation.view', 'navigation.manage',
  'themes.view', 'themes.manage',
  'metafields.view', 'metafields.manage',
  'salesChannels.view', 'salesChannels.manage',
  'apiCredentials.view', 'apiCredentials.manage',
  'abandonedCheckouts.view', 'abandonedCheckouts.manage',
  'analytics.view',
  'reports.view',
  'settings.view', 'settings.manage'
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  // ADMIN can see who has access (users.view) but can't create/promote/deactivate
  // accounts (users.manage) or touch settings.manage - those stay SUPER_ADMIN-only
  // so a compromised or careless ADMIN account can't escalate its own privileges.
  ADMIN: ALL_PERMISSIONS.filter(p => !['settings.manage', 'users.manage'].includes(p)),
  MANAGER: ALL_PERMISSIONS.filter(p => ![
    'settings.manage', 'users.view', 'users.manage', 'activity.view',
    'media.manage', 'content.manage', 'themes.manage', 'navigation.manage',
    'apiCredentials.manage'
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

// A staff member on a custom role (Users & roles) carries its permissions, resolved when they
// are loaded (lib/auth getCurrentUser); otherwise their built-in role decides.
export type PermissionSubject = Role | { role: Role; permissions?: Permission[] | null }

export function permissionsFor(subject: PermissionSubject): Permission[] {
  if (typeof subject === 'string') return ROLE_PERMISSIONS[subject] ?? []
  if (subject.role === 'CUSTOMER') return []
  if (Array.isArray(subject.permissions)) return subject.permissions
  return ROLE_PERMISSIONS[subject.role] ?? []
}

export function hasPermission(subject: PermissionSubject, permission: Permission) {
  return permissionsFor(subject).includes(permission)
}

// Custom roles can't hand out staff management: only the owner adds, edits or removes staff,
// so nobody can grant themselves (or a friend) more access than they were given.
export const OWNER_ONLY_PERMISSIONS: Permission[] = ['users.manage']
