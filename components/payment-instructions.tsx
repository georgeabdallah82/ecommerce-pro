import { getPublicPaymentMethods } from '@/lib/payment-methods-public'
import { getT } from '@/lib/i18n-server'

// How to pay an order that isn't paid yet, shown after checkout and on the order page. Bank
// transfer customers otherwise only saw the bank details on the checkout form, before ordering.
export async function PaymentInstructions({ method, status, amount, orderNumber }: { method: string; status: string; amount: string; orderNumber: string }) {
  if (status === 'PAID') return null
  const t = await getT()
  if (method === 'COD') return <div className="card" style={{ padding: 16, margin: '16px 0' }}><strong>{t('Cash on delivery')}</strong><p className="muted" style={{ margin: '6px 0 0' }}>{t('Please have {amount} ready when your order arrives.', { amount })}</p></div>
  if (method !== 'BANK_TRANSFER') return null
  const bank = (await getPublicPaymentMethods().catch(() => null))?.bank
  return (
    <div className="card" style={{ padding: 16, margin: '16px 0', textAlign: 'start' }}>
      <strong>{t('Pay {amount} by bank transfer', { amount })}</strong>
      {bank ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: '10px 0 0', fontSize: 14 }}>
          {bank.bankName && <><dt className="muted">{t('Bank')}</dt><dd style={{ margin: 0 }}>{bank.bankName}</dd></>}
          {bank.accountName && <><dt className="muted">{t('Account name')}</dt><dd style={{ margin: 0 }}>{bank.accountName}</dd></>}
          {bank.iban && <><dt className="muted">IBAN</dt><dd style={{ margin: 0, fontWeight: 700, overflowWrap: 'anywhere' }} dir="ltr">{bank.iban}</dd></>}
          <dt className="muted">{t('Reference')}</dt><dd style={{ margin: 0, fontWeight: 700 }} dir="ltr">{orderNumber}</dd>
        </dl>
      ) : <p className="muted" style={{ margin: '6px 0 0' }}>{t("We'll contact you with the bank details.")}</p>}
      {bank?.instructions && <p className="muted" style={{ margin: '10px 0 0' }}>{bank.instructions}</p>}
      <p className="muted" style={{ margin: '10px 0 0' }}>{t('Your order ships once the payment arrives.')}</p>
    </div>
  )
}
