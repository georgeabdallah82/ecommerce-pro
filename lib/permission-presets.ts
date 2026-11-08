// Starting points for a custom role, so the roles used by the store team are quick to set up.
// A preset only fills in the Users & roles form; the owner can change it, and the server enforces
// whatever the saved role says. Presets never include the owner-only permissions (users.manage) or
// settings or API credentials, so no preset can give someone the power to grant access.

import { ALL_PERMISSIONS, OWNER_ONLY_PERMISSIONS, type Permission } from '@/lib/permissions'

export type RolePreset = { key: string; name: string; description: string; permissions: Permission[] }

const NEVER_IN_A_PRESET: Permission[] = [...OWNER_ONLY_PERMISSIONS, 'settings.manage', 'apiCredentials.view', 'apiCredentials.manage']

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: 'erp-administrator',
    name: 'ERP administrator',
    description: 'Runs the ERP day to day: products, stock, purchasing, sales, customers and reports.',
    permissions: ALL_PERMISSIONS.filter(p => !NEVER_IN_A_PRESET.includes(p)),
  },
  {
    key: 'inventory-manager',
    name: 'Inventory manager',
    description: 'Products, stock, transfers, purchase orders and stock reports.',
    permissions: [
      'dashboard.view',
      'products.view', 'products.manage',
      'inventory.view', 'inventory.manage',
      'transfers.view', 'transfers.manage',
      'purchaseOrders.view', 'purchaseOrders.manage',
      'collections.view',
      'reports.view',
    ],
  },
  {
    key: 'cashier',
    name: 'Cashier',
    description: 'Sells at the till, opens and closes their shift, takes customers and records permitted returns.',
    permissions: [
      'dashboard.view',
      'products.view',
      'orders.view', 'orders.manage', 'orders.refund',
      'customers.view', 'customers.manage',
    ],
  },
  {
    key: 'sales-manager',
    name: 'Sales manager',
    description: 'Sales across the store and the till, customers, discounts and business reports.',
    permissions: [
      'dashboard.view',
      'orders.view', 'orders.manage', 'orders.refund',
      'draftOrders.view', 'draftOrders.manage',
      'customers.view', 'customers.manage',
      'customerSegments.view', 'customerSegments.manage',
      'coupons.view', 'coupons.manage',
      'giftCards.view',
      'storeCredit.view',
      'reports.view', 'analytics.view',
    ],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only: can look at sales, stock and customers, and change nothing.',
    permissions: [
      'dashboard.view',
      'products.view', 'inventory.view', 'purchaseOrders.view',
      'orders.view', 'customers.view',
      'reports.view',
    ],
  },
]
