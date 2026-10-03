import { getPublicPaymentMethods } from '@/lib/payment-methods-public'

// How to pay an order that isn't paid yet, shown after checkout and on the order page. Bank
// transfer customers otherwise only saw the bank details on the checkout form, before ordering.
export async function PaymentInstructions({ method, status, amount, orderNumber }: { method: string; status: string; amount: string; orderNumber: string }) {
  if (status === 'PAID') return null
  if (method === 'COD') return <div className="card" style={{ padding: 16, margin: '16px 0' }}><strong>Cash on delivery</strong><p className="muted" style={{ margin: '6px 0 0' }}>Please have <strong>{amount}</strong> ready when your order arrives.</p></div>
  if (method !== 'BANK_TRANSFER') return null
  const bank = (await getPublicPaymentMethods().catch(() => null))?.bank
  return (
    <div className="card" style={{ padding: 16, margin: '16px 0', textAlign: 'left' }}>
      <strong>Pay {amount} by bank transfer</strong>
      {bank ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: '10px 0 0', fontSize: 14 }}>
          {bank.bankName && <><dt className="muted">Bank</dt><dd style={{ margin: 0 }}>{bank.bankName}</dd></>}
          {bank.accountName && <><dt className="muted">Account name</dt><dd style={{ margin: 0 }}>{bank.accountName}</dd></>}
          {bank.iban && <><dt className="muted">IBAN</dt><dd style={{ margin: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{bank.iban}</dd></>}
          <dt className="muted">Reference</dt><dd style={{ margin: 0, fontWeight: 700 }}>{orderNumber}</dd>
        </dl>
      ) : <p className="muted" style={{ margin: '6px 0 0' }}>We&apos;ll contact you with the bank details.</p>}
      {bank?.instructions && <p className="muted" style={{ margin: '10px 0 0' }}>{bank.instructions}</p>}
      <p className="muted" style={{ margin: '10px 0 0' }}>Your order ships once the payment arrives.</p>
    </div>
  )
}
