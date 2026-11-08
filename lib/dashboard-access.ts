import type { Permission } from '@/lib/permissions'

// What the dashboard may show a signed-in person. Money figures need the analytics or reports
// permission, the activity log needs activity.view, and low stock needs inventory.view. The
// layout still shows the orders and reviews every dashboard user can already open.
export type DashboardAccess = { money: boolean; activity: boolean; stock: boolean }

export function dashboardAccess(allowed: (permission: Permission) => boolean): DashboardAccess {
  return {
    money: allowed('analytics.view') || allowed('reports.view'),
    activity: allowed('activity.view'),
    stock: allowed('inventory.view'),
  }
}
