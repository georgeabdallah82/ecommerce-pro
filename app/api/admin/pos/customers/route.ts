import { requirePermission } from '@/lib/auth'
import { searchTillCustomers } from '@/lib/pos-customers'
import { json } from '@/lib/utils'

// Find store customers to attach to a till sale. Needs permission to view customers.
export async function GET(req: Request) {
  try {
    await requirePermission('customers.view')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  const query = new URL(req.url).searchParams.get('q')?.slice(0, 80) ?? ''
  if (query.trim().length < 2) return json([], { headers: { 'Cache-Control': 'no-store' } })
  return json(await searchTillCustomers(query), { headers: { 'Cache-Control': 'no-store' } })
}
