import type { Metadata } from 'next'
import { PolicyPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Terms of service' }

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Text is edited in Online Store › Policies (components/legal-page.tsx PolicyPage).
export default function TermsOfService() {
  return <PolicyPage kind="terms" />
}
