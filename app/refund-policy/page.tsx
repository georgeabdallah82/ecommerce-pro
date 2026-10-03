import { PolicyPage } from '@/components/legal-page'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Text is edited in Online Store › Policies (components/legal-page.tsx PolicyPage).
export default function RefundPolicy() {
  return <PolicyPage kind="refund" />
}
