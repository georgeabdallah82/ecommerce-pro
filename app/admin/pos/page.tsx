import { requirePermission } from '@/lib/auth'

// The point-of-sale till. Only the placeholder exists yet: sales, shifts, receipts and returns at
// the counter are built in the POS phase (docs/erp-pos-architecture.md).
export default async function PointOfSalePage() {
  await requirePermission('dashboard.view')
  return (
    <section style={{ maxWidth: 640, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Point of sale</h1>
      <p style={{ color: '#5f6673', lineHeight: 1.6, margin: 0 }}>
        The till is not built yet. Sales, cashier shifts, receipts and returns at the counter will appear here.
      </p>
    </section>
  )
}
