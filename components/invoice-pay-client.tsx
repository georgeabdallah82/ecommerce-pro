'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/lang-provider'
import { markT } from '@/lib/i18n'

type ClientCheckout = { type: 'mpgs'; merchantId: string; sessionId: string; scriptUrl: string }

declare global { interface Window { Checkout?: { configure: (options: unknown) => void; showPaymentPage: () => void } } }

// "Pay now" on an invoice the store sent (app/pay-invoice/[id]): starts the card payment and opens the gateway's
// secure page. The page gives the button its look (buttonClassName).
export default function InvoicePayClient({ draftOrderId, token, buttonClassName = 'btn' }: { draftOrderId: string; token: string; buttonClassName?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18n()
  const [clientCheckout, setClientCheckout] = useState<ClientCheckout | null>(null)

  useEffect(() => {
    if (!clientCheckout) return
    const launch = () => {
      if (!window.Checkout) return
      window.Checkout.configure({ merchant: clientCheckout.merchantId, session: { id: clientCheckout.sessionId } })
      window.Checkout.showPaymentPage()
    }
    if (window.Checkout) { launch(); return }
    const script = document.createElement('script')
    script.src = clientCheckout.scriptUrl
    script.async = true
    script.onload = launch
    script.onerror = () => setError(markT('Unable to load the secure payment page. Please try again.'))
    document.body.appendChild(script)
    return () => { script.onload = null }
  }, [clientCheckout])

  async function pay() {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/invoice/${draftOrderId}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to start payment')
      if (data.payment?.type === 'mpgs') { setClientCheckout(data.payment as ClientCheckout); return }
      setError(markT('Payment could not be started.')); setLoading(false)
    } catch (e) { setError(e instanceof Error ? e.message : markT('Unable to start payment')); setLoading(false) }
  }

  if (clientCheckout) return <div className="alert" role="status">{t('Loading secure payment…')}</div>

  return <div style={{ display: 'grid', gap: 12 }}>
    {error && <div className="alert danger" role="alert">{t(error)}</div>}
    <button type="button" className={buttonClassName} onClick={pay} disabled={loading} aria-busy={loading}>{loading ? t('Starting payment…') : t('Pay now')}</button>
  </div>
}
