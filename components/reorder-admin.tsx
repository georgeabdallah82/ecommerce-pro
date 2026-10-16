'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, ClipboardList, Copy, MessageCircle, PackageCheck } from 'lucide-react'
import { money } from '@/lib/config'
import { REORDER_COVER_DAYS, REORDER_SALES_DAYS, daysLeftText, groupBySupplier, supplierOrderMessage, type ReorderRow } from '@/lib/reorder'
import { supplierKey } from '@/lib/suppliers'
import { whatsappChatLink } from '@/lib/checkout-followup'
import { NumInput } from './num-input'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

// Inventory > What to reorder (app/admin/inventory/reorder).
export default function ReorderAdmin({ rows, cover, storeName, currency, phones = {} }: { rows: ReorderRow[]; cover: number; storeName: string; currency: string; phones?: Record<string, string> }) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(rows.map(r => [r.key, r.suggested])))
  const [copied, setCopied] = useState('')
  const groups = useMemo(() => groupBySupplier(rows), [rows])

  const lines = (list: ReorderRow[]) => list.map(r => ({ name: r.name, variant: r.variant, sku: r.sku, quantity: qty[r.key] || 0 }))
  const copy = async (supplier: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(supplier); setTimeout(() => setCopied(''), 1500) } catch {} }

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/inventory"><ArrowLeft size={15} /> Inventory</Link>
    <div>
      <h1 className={s.title}>What to reorder</h1>
      <p className={s.subtitle}>Products that are low on stock or will run out within {cover} days at the speed they sold in the last {REORDER_SALES_DAYS} days, the ones running out first at the top. The quantity to buy is what lasts {cover} days; change it as you like, then send the list to the supplier.</p>
    </div>
    <div className={s.chips} role="group" aria-label="Buy enough for">
      {REORDER_COVER_DAYS.map(d => <Link key={d} className={`${s.chip}${d === cover ? ` ${s.chipOn}` : ''}`} href={`/admin/inventory/reorder?cover=${d}`}>Enough for {d} days</Link>)}
    </div>
    {!rows.length ? <div className={`${ui.card} ${ui.empty}`}><PackageCheck size={28} /><h3>Nothing to reorder</h3><p className={ui.muted}>Every product has enough stock for the next {cover} days.</p></div>
      : groups.map(group => {
        const message = supplierOrderMessage(storeName, lines(group.rows))
        const units = group.rows.reduce((sum, r) => sum + (qty[r.key] || 0), 0)
        const cost = group.rows.reduce((sum, r) => sum + (r.cost || 0) * (qty[r.key] || 0), 0)
        const missingCost = group.rows.some(r => !r.cost && (qty[r.key] || 0) > 0)
        const phone = group.supplier === 'No supplier' ? '' : phones[supplierKey(group.supplier)] || ''
        return <section key={group.supplier} className={`${ui.card} ${s.card}`}>
          <div className={s.head}>
            <div><strong className={s.name}><ClipboardList size={16} style={{ verticalAlign: '-2px' }} /> {group.supplier}</strong><div className={s.meta}><span>{group.rows.length} product{group.rows.length === 1 ? '' : 's'}</span></div></div>
            <div className={s.amount}><strong>{units} to buy</strong><span>{cost ? `about ${money(cost, currency)}${missingCost ? ' + items without a cost' : ''}` : missingCost ? 'add product costs to see the total' : ''}</span></div>
          </div>
          <div className={ui.tableWrap}><table className={`${ui.table} ${ui.cardTable}`}>
            <thead><tr><th>Product</th><th>In stock</th><th>Sold ({REORDER_SALES_DAYS} days)</th><th>Runs out</th><th>Buy</th></tr></thead>
            <tbody>{group.rows.map(r => <tr key={r.key}>
              <td data-cell="primary"><Link className={ui.textLink} href={`/admin/products/${r.productId}`}>{r.name}</Link>{r.variant && <div className={ui.muted}>{r.variant}</div>}<div className={ui.muted}>{r.sku}</div></td>
              <td data-label="In stock"><strong style={{ color: r.available <= 0 ? '#b42318' : undefined }}>{Math.max(0, r.available)}</strong></td>
              <td data-label={`Sold (${REORDER_SALES_DAYS} days)`}>{r.sold}</td>
              <td data-label="Runs out">{daysLeftText(r)}</td>
              <td data-label="Buy"><NumInput className={ui.input} style={{ width: 84 }} value={qty[r.key] ?? 0} empty={0} onValue={n => setQty(current => ({ ...current, [r.key]: Math.max(0, Math.floor(n ?? 0)) }))} aria-label={`How many ${r.name} to buy`} /></td>
            </tr>)}</tbody>
          </table></div>
          <div className={s.actions}>
            <a className={`${ui.btn} ${s.whatsapp}`} href={phone ? whatsappChatLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {phone ? `Send to ${group.supplier}` : 'Send to the supplier'}</a>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => copy(group.supplier, message)}>{copied === group.supplier ? <Check size={16} /> : <Copy size={16} />} {copied === group.supplier ? 'Copied' : 'Copy the list'}</button>
          </div>
          {!phone && group.supplier !== 'No supplier' && <p className={ui.muted}><Link className={ui.textLink} href="/admin/inventory/suppliers">Add {group.supplier}&apos;s WhatsApp number</Link> to send the list straight to their chat.</p>}
        </section>
      })}
    <p className={ui.muted}>The supplier is the &quot;Vendor&quot; on each product (<Link className={ui.textLink} href="/admin/inventory/suppliers">Suppliers</Link>). Free gifts are not counted as sales.</p>
  </div>
}
