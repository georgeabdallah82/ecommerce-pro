import { Role } from '@prisma/client'

export type Permission =
  | 'dashboard.view'
  | 'products.view' | 'products.manage'
  | 'inventory.view' | 'inventory.manage'
  | 'orders.view' | 'orders.manage' | 'orders.refund'
  | 'customers.view' | 'customers.manage'
  | 'categories.view' | 'categories.manage'
  | 'collections.view' | 'collections.manage'
  | 'coupons.view' | 'coupons.manage'
  | 'reviews.view' | 'reviews.manage'
  | 'users.view' | 'users.manage'
  | 'activity.view'
  | 'shipping.view' | 'shipping.manage'
  | 'content.view' | 'content.manage'
  | 'media.view' | 'media.manage'
  | 'reports.view'
  | 'settings.view' | 'settings.manage'

const all: Permission[] = [
  'dashboard.view', 'products.view', 'products.manage', 'inventory.view', 'inventory.manage',
  'orders.view', 'orders.manage', 'orders.refund', 'customers.view', 'customers.manage',
  'categories.view', 'categories.manage', 'collections.view', 'collections.manage',
  'coupons.view', 'coupons.manage', 'reviews.view', 'reviews.manage', 'users.view', 'users.manage',
  'activity.view', 'shipping.view', 'shipping.manage', 'content.view', 'content.manage',
  'media.view', 'media.manage', 'reports.view', 'settings.view', 'settings.manage'
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: all,
  ADMIN: all.filter(p => !['settings.manage', 'users.view', 'users.manage'].includes(p)),
  MANAGER: all.filter(p => !['settings.manage', 'users.view', 'users.manage', 'activity.view', 'media.manage', 'content.manage'].includes(p)),
  SUPPORT: ['dashboard.view','orders.view','orders.manage','customers.view','customers.manage','reviews.view','reviews.manage'],
  EDITOR: ['dashboard.view','products.view','products.manage','categories.view','categories.manage','collections.view','collections.manage','reviews.view','reviews.manage','content.view','content.manage','media.view','media.manage'],
  CUSTOMER: []
}

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
