'use client'

import { useEffect, useState } from 'react'

type ClientCheckout = { type: 'mpgs'; merchantId: string; sessionId: string; scriptUrl: string }

declare global { interface Window { Checkout?: { configure: (options: unknown) => void; showPaymentPage: () => void } } }

export default function InvoicePayClient({ draftOrderId, token }: { draftOrderId: string; token: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
    script.onerror = () => setError('Unable to load the secure payment page. Please try again.')
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
      setError('Payment could not be started.'); setLoading(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start payment'); setLoading(false) }
  }

  if (clientCheckout) return <div className="alert" style={{ marginTop: 20 }}>Loading secure payment…</div>

  return <div style={{ marginTop: 24 }}>
    {error && <div className="alert danger" style={{ marginBottom: 12 }}>{error}</div>}
    <button className="btn" onClick={pay} disabled={loading}>{loading ? 'Starting payment…' : 'Pay now'}</button>
  </div>
}
