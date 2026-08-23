import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import InvoiceActions from '@/components/invoice-actions'

function money(v:number,currency:string){return `${currency} ${(v/100).toFixed(2)}`}
function address(raw:string|null|undefined){if(!raw)return '—';try{const a=JSON.parse(raw);return [a.firstName&&a.lastName?`${a.firstName} ${a.lastName}`:a.firstName||a.lastName,a.line1,a.line2,[a.city,a.region,a.postalCode].filter(Boolean).join(', '),a.country,a.phone].filter(Boolean).join('\n')}catch{return raw}}

export default async function InvoicePage({params}:{params:Promise<{id:string}>}){
  await requirePermission('orders.view')
  const {id}=await params
  const [o,{theme}]=await Promise.all([
    db.order.findUnique({where:{id},include:{items:{include:{product:{include:{images:true}},variant:true},},user:true,paymentTransactions:{orderBy:{createdAt:'desc'}}}}),
    getThemeState(),
  ])
  if(!o)notFound()
  const brand=theme.brandName||'Your Brand'
  const currency=o.currency||theme.currency||'USD'
  return <main className="invoicePage"><InvoiceActions orderNumber={o.orderNumber}/><article className="invoiceSheet">
    <header className="invoiceHeader"><div><div className="invoiceBrand">{theme.logoUrl?<img src={theme.logoUrl} alt={brand}/>:<strong>{brand}</strong>}</div><div className="invoiceMuted">Invoice / Order receipt</div></div><div className="invoiceMeta"><div><span>Order</span><strong>#{o.orderNumber}</strong></div><div><span>Date</span><strong>{new Date(o.createdAt).toLocaleDateString()}</strong></div><div><span>Status</span><strong>{o.status}</strong></div></div></header>
    <section className="invoiceAddresses"><div><small>Bill to</small><div>{o.user?.name||o.email}</div><p>{o.email}{o.phone?`\n${o.phone}`:''}</p><p>{address(o.billingAddressJson||o.shippingAddressJson)}</p></div><div><small>Ship to</small><p>{address(o.shippingAddressJson)}</p></div></section>
    <section><table className="invoiceTable"><thead><tr><th>Item</th><th>SKU</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Total</th></tr></thead><tbody>{o.items.map(i=><tr key={i.id}><td><strong>{i.name}</strong></td><td>{i.sku}</td><td className="num">{i.quantity}</td><td className="num">{money(i.unitPrice,currency)}</td><td className="num">{money(i.totalPrice,currency)}</td></tr>)}</tbody></table></section>
    <section className="invoiceBottom"><div className="invoiceNotes"><small>Payment</small><p>{o.paymentMethod} · {o.paymentStatus}</p><small>Shipping</small><p>{o.shippingMethod||'—'}{o.trackingNumber?` · ${o.trackingNumber}`:''}</p>{o.notes&&<><small>Notes</small><p>{o.notes}</p></>}</div><div className="invoiceTotals"><div><span>Subtotal</span><strong>{money(o.subtotal,currency)}</strong></div><div><span>Discount</span><strong>- {money(o.discountTotal,currency)}</strong></div><div><span>Shipping</span><strong>{money(o.shippingTotal,currency)}</strong></div><div><span>Tax</span><strong>{money(o.taxTotal,currency)}</strong></div><div className="grand"><span>Total</span><strong>{money(o.grandTotal,currency)}</strong></div></div></section>
    <footer className="invoiceFooter"><span>Thank you for your business.</span><span>{brand}</span></footer>
  </article></main>
}
