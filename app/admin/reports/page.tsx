import { requirePermission } from '@/lib/auth'; import ReportsAdmin from '@/components/reports-admin';
export default async function Reports(){await requirePermission('reports.view');return <ReportsAdmin/>}
