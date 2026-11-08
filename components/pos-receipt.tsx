'use client'

import { money } from '@/lib/config'

export type ReceiptData = {
  orderNumber: string
  createdAt: string
  cashierName: string
  locationName: string
  registerName: string
  subtotalCents: number
  discountCents: number
  grandTotalCents: number
  changeUsdCents: number
  exchangeRateLbp: number | null
  items: Array<{ name: string; sku: string; quantity: number; unitPrice: number; totalPrice: number }>
  payments: Array<{ method: string; currency: 'USD' | 'LBP'; amount: number; reference: string | null }>
}

const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', WHISH: 'Whish Money', OMT: 'OMT', OTHER: 'Other' }

const css = `
.receipt { background:#fff; color:#111; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; line-height:1.45; padding:10px; margin:16px auto; box-sizing:border-box; width:var(--receipt-width); border:1px solid #e4e4df; }
.receipt h1 { font-size:16px; margin:0; letter-spacing:.04em; }
.receipt .muted { color:#555; }
.receipt .rule { border-top:1px dashed #777; margin:8px 0; }
.receipt .row { display:flex; justify-content:space-between; gap:8px; }
.receipt .item { margin:4px 0; }
.receipt .bold { font-weight:700; }
@page { size: var(--receipt-width) auto; margin: 3mm; }
@media print {
  body * { visibility:hidden; }
  .receipt, .receipt * { visibility:visible; }
  .receipt { position:absolute; left:0; top:0; margin:0; border:0; padding:0; }
  .noprint { display:none !important; }
}
`

/** A thermal-printer receipt. The width is 58 mm or 80 mm, and printing uses the browser's print dialog. */
export default function PosReceipt({ receipt, widthMm }: { receipt: ReceiptData; widthMm: 58 | 80 }) {
  const lbp = (value: number) => `LBP ${value.toLocaleString('en-US')}`
  const when = new Date(receipt.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
  return (
    <>
      <style>{css}</style>
      <div className="noprint" style={{ textAlign: 'center', padding: '16px 0 0', fontFamily: 'inherit' }}>
        <button type="button" onClick={() => window.print()} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #171717', background: '#171717', color: '#fff', font: 'inherit', cursor: 'pointer' }}>
          Print receipt ({widthMm} mm)
        </button>
      </div>
      <article className="receipt" style={{ ['--receipt-width' as string]: `${widthMm}mm` }} aria-label={`Receipt ${receipt.orderNumber}`}>
        <div style={{ textAlign: 'center' }}>
          <h1>YALLA HAUL</h1>
          <div className="muted">{receipt.locationName}</div>
        </div>
        <div className="rule" />
        <div className="row"><span>Receipt</span><span className="bold">{receipt.orderNumber}</span></div>
        <div className="row"><span>Date</span><span>{when}</span></div>
        <div className="row"><span>Register</span><span>{receipt.registerName}</span></div>
        <div className="row"><span>Cashier</span><span>{receipt.cashierName}</span></div>
        <div className="rule" />
        {receipt.items.map((item, index) => (
          <div className="item" key={index}>
            <div>{item.name}</div>
            <div className="row muted">
              <span>{item.quantity} × {money(item.unitPrice)}</span>
              <span>{money(item.totalPrice)}</span>
            </div>
          </div>
        ))}
        <div className="rule" />
        <div className="row"><span>Subtotal</span><span>{money(receipt.subtotalCents)}</span></div>
        {receipt.discountCents > 0 && <div className="row"><span>Discount</span><span>−{money(receipt.discountCents)}</span></div>}
        <div className="row bold" style={{ fontSize: 14, marginTop: 4 }}><span>TOTAL</span><span>{money(receipt.grandTotalCents)}</span></div>
        <div className="rule" />
        {receipt.payments.map((payment, index) => (
          <div className="row" key={index}>
            <span>{METHOD_LABEL[payment.method] ?? payment.method}{payment.reference ? ` (${payment.reference})` : ''}</span>
            <span>{payment.currency === 'USD' ? money(payment.amount) : lbp(payment.amount)}</span>
          </div>
        ))}
        {receipt.changeUsdCents > 0 && <div className="row bold"><span>Change</span><span>{money(receipt.changeUsdCents)}</span></div>}
        {receipt.exchangeRateLbp && <div className="muted" style={{ marginTop: 6 }}>Rate used: {lbp(receipt.exchangeRateLbp)} per USD</div>}
        <div className="rule" />
        <div style={{ textAlign: 'center' }}>Thank you for shopping with Yalla Haul</div>
      </article>
    </>
  )
}
