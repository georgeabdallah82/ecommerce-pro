import type { Metadata } from 'next'
import { StoreFooter } from '@/components/store-footer'
import WholesaleForm from '@/components/wholesale-form'
import { getT } from '@/lib/i18n-server'

export const metadata: Metadata = { title: 'Wholesale and bulk orders' }
export const dynamic = 'force-dynamic'

// For shops and offices that buy in quantity. The form is saved and sent to the store's contact address.
export default async function Wholesale() {
  const t = await getT()
  return <>
    <main className="section">
      <div className="container" style={{ maxWidth: 640, display: 'grid', gap: 18 }}>
        <div>
          <span className="muted">{t('WHOLESALE')}</span>
          <h1 className="h2">{t('Buying for a shop or an office?')}</h1>
          <p className="muted">{t('Tell us what you need and how often. We will send you prices for quantities and get back to you soon.')}</p>
        </div>
        <WholesaleForm />
      </div>
    </main>
    <StoreFooter />
  </>
}
