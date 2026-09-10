'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, PackageCheck, Mail, Phone, MapPin, Save, Plus, Copy, Check, Pencil, X, FileEdit } from 'lucide-react'
import { money } from '@/lib/config'
import { canTransitionOrder, canTransitionPayment } from '@/lib/orders'
import s from './admin-order-detail.module.css'
import ui from './admin-ui.module.css'
import DeliveryTrackingAdmin from './delivery-tracking-admin'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// Order status is settable to REFUNDED only through the refund workflow (the
// PATCH endpoint rejects it outright), so it never belongs in this dropdown.
const ORDER_STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const
// Same story for PARTIALLY_REFUNDED / REFUNDED payment states - the PATCH
// endpoint always rejects setting them directly, so offering them here would
// be a control that looks functional but can never actually be saved.
const PAYMENT_STATUS_OPTIONS = ['UNPAID', 'PENDING', 'PAID', 'FAILED'] as const

function parseAddress(raw: string | null | undefined) {
  if (!raw) return { firstName:'', lastName:'', line1:'', line2:'', city:'', region:'', postalCode:'', country:'', phone:'' }
  try { const a = JSON.parse(raw); return { firstName:a.firstName||'', lastName:a.lastName||'', line1:a.line1||'', line2:a.line2||'', city:a.city||'', region:a.region||'', postalCode:a.postalCode||'', country:a.country||'', phone:a.phone||'' } } catch { return { firstName:'', lastName:'', line1:raw, line2:'', city:'', region:'', postalCode:'', country:'', phone:'' } }
}

function addressText(raw: string | null | undefined) {
  const a = parseAddress(raw)
  return [`${a.firstName} ${a.lastName}`.trim(),a.line1,a.line2,[a.city,a.region,a.postalCode].filter(Boolean).join(', '),a.country,a.phone].filter(Boolean).join('\n') || '—'
}

function paymentPillClass(status: string) {
  if (status === 'PAID') return s.pillSuccess
  if (status === 'FAILED') return s.pillDanger
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return s.pillNeutral
  return s.pillWarning
}
function fulfillmentPillClass(status: string) {
  if (status === 'FULFILLED') return s.pillSuccess
  if (status === 'PARTIAL') return s.pillWarning
  return s.pillNeutral
}

export default function OrderDetailAdmin({ initial, canStartOrderEdit }: { initial: any; canStartOrderEdit?: boolean }) {
  const [o, setO] = useState(initial)
  const [status, setStatus] = useState(o.status)
  const [paymentStatus, setPaymentStatus] = useState(o.paymentStatus)
  const [tracking, setTracking] = useState(o.trackingNumber || '')
  const [email, setEmail] = useState(o.email || '')
  const [phone, setPhone] = useState(o.phone || '')
  const [shipping, setShipping] = useState(parseAddress(o.shippingAddressJson))
  const [billing, setBilling] = useState(parseAddress(o.billingAddressJson))
  const [notesValue, setNotesValue] = useState(o.notes || '')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState('')
  const itemCount = useMemo(() => (o.items || []).reduce((a: number, x: any) => a + x.quantity, 0), [o.items])

  const availableStatuses = useMemo(() => {
    const opts = ORDER_STATUS_OPTIONS.filter(x => x === o.status || canTransitionOrder(o.status, x))
    return opts.length ? opts : [o.status]
  }, [o.status])
  const availablePaymentStatuses = useMemo(() => {
    if (o.paymentStatus === 'PARTIALLY_REFUNDED' || o.paymentStatus === 'REFUNDED') return [o.paymentStatus]
    const opts = PAYMENT_STATUS_OPTIONS.filter(x => x === o.paymentStatus || canTransitionPayment(o.paymentStatus, x))
    return opts.length ? opts : [o.paymentStatus]
  }, [o.paymentStatus])
  const statusLocked = availableStatuses.length <= 1
  const paymentLocked = availablePaymentStatuses.length <= 1

  function addressPayload(a:any) { return JSON.stringify({ ...a, firstName:a.firstName.trim(), lastName:a.lastName.trim(), line1:a.line1.trim(), line2:a.line2.trim()||undefined, city:a.city.trim(), region:a.region.trim()||undefined, postalCode:a.postalCode.trim()||undefined, country:a.country.trim(), phone:a.phone.trim()||undefined }) }
  function beginEdit(){ setEmail(o.email||''); setPhone(o.phone||''); setShipping(parseAddress(o.shippingAddressJson)); setBilling(parseAddress(o.billingAddressJson)); setNotesValue(o.notes||''); setTracking(o.trackingNumber||''); setEditing(true); setMsg('') }
  function cancelEdit(){ setEditing(false); setMsg('') }
  async function save(){
    setSaving(true); setMsg('')
    try {
      const body = { id:o.id, status, paymentStatus, trackingNumber:tracking, email, phone, shippingAddressJson:addressPayload(shipping), billingAddressJson:(billing.line1||billing.city||billing.country)?addressPayload(billing):null, notes:notesValue }
      const d=await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify(body)})
      const next={...o,...(d.order||{}),status,paymentStatus,trackingNumber:tracking,email,phone,shippingAddressJson:body.shippingAddressJson,billingAddressJson:body.billingAddressJson,notes:notesValue}
      setO(next); setEditing(false); setMsg('Order updated successfully.')
    } catch(e){
      // The status/payment dropdowns can't fully prevent an invalid pick (the
      // valid set can only be computed from the last-saved order), so on a
      // rejected save we snap them back to what's actually persisted instead
      // of silently leaving the control on a value that was never applied.
      setStatus(o.status); setPaymentStatus(o.paymentStatus)
      setMsg(e instanceof Error?e.message:'Unable to update order')
    } finally { setSaving(false) }
  }
  async function addNote(){const value=note.trim();if(!value)return;setAddingNote(true);setMsg('');try{const d=await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify({id:o.id,addNote:value})});setO((c:any)=>({...c,notesHistory:[d.note,...(c.notesHistory||[])]}));setNote('');setMsg('Internal note added.')}catch(e){setMsg(e instanceof Error?e.message:'Unable to add note')}finally{setAddingNote(false)}}
  async function copyOrderNumber(){try{await navigator.clipboard.writeText(String(o.orderNumber));setCopied(true);window.setTimeout(()=>setCopied(false),1500)}catch{}}

  return <div>
    <div className={ui.sectionHead}>
      <div>
        <Link className={ui.textLink} href="/admin/orders"><ArrowLeft size={15}/> Back to orders</Link>
        <span className={`${ui.muted} ${ui.tiny}`} style={{display:'block',marginTop:12}}>ORDER</span>
        <div className="inline" style={{gap:8}}><h1 className={ui.title}>#{o.orderNumber}</h1><button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={copyOrderNumber}>{copied?<Check size={14}/>:<Copy size={14}/>}</button></div>
        <p className={ui.muted}>Placed {new Date(o.createdAt).toLocaleString()}</p>
      </div>
      <div className="inline">
        <Link className={`${ui.btn} ${ui.btnSecondary}`} href={`/admin/orders/${o.id}/invoice`}>Invoice / Print</Link>
        {canStartOrderEdit&&<Link className={`${ui.btn} ${ui.btnSecondary}`} href={`/admin/order-edits/new?orderId=${o.id}`}><FileEdit size={15}/> Start order edit</Link>}
        <span className={`${s.statusPill} ${paymentPillClass(o.paymentStatus)}`}>{o.paymentStatus}</span>
        <span className={`${s.statusPill} ${fulfillmentPillClass(o.fulfillmentStatus)}`}>{o.fulfillmentStatus}</span>
        <button className={ui.btn} onClick={beginEdit}><Pencil size={15}/> Edit order</button>
      </div>
    </div>

    {msg&&<div className={ui.alert}>{msg}</div>}

    {editing&&<section className={s.editToolbar}><div><strong>Edit order</strong><div className={ui.muted} style={{fontSize:12}}>Update the customer, contact details, shipping/billing addresses and staff notes without creating a new order.</div></div><div className="inline"><button className={`${ui.btn} ${ui.btnGhost}`} onClick={cancelEdit} disabled={saving}><X size={15}/> Cancel</button><button className={ui.btn} onClick={save} disabled={saving}><Save size={15}/>{saving?'Saving…':'Save changes'}</button></div></section>}

    <div className={s.grid}>
      <main className={s.main}>
        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Items</h3><span className={ui.muted}>{itemCount} items</span></div>
          {(o.items||[]).map((x:any)=><div className={s.itemRow} key={x.id}><div className={s.itemImage}>{x.product?.images?.[0]?.url?<img src={x.product.images[0].url} alt=""/>:<PackageCheck size={18}/>}</div><div><strong>{x.name}</strong><div className={ui.muted}>{x.sku}{x.variant?.name?` • ${x.variant.name}`:''}</div></div><span>× {x.quantity}</span><strong>{money(x.totalPrice,o.currency)}</strong></div>)}
          <div className={s.summaryBox}><div><span>Subtotal</span><strong>{money(o.subtotal,o.currency)}</strong></div><div><span>Discount</span><strong>- {money(o.discountTotal,o.currency)}</strong></div><div><span>Shipping</span><strong>{money(o.shippingTotal,o.currency)}</strong></div><div><span>Tax</span><strong>{money(o.taxTotal,o.currency)}</strong></div><div className={s.total}><span>Total</span><strong>{money(o.grandTotal,o.currency)}</strong></div></div>
        </section>

        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h3>Customer</h3><span className={ui.muted}>Order contact details</span></div></div>
          {editing ? <div className={s.twoCol}><label className={ui.fieldLabel}>Email<input className={ui.input} value={email} onChange={e=>setEmail(e.target.value)} /></label><label className={ui.fieldLabel}>Phone<input className={ui.input} value={phone} onChange={e=>setPhone(e.target.value)} /></label></div> : <><strong>{o.user?.name||o.email}</strong><p className={ui.muted}><Mail size={13}/> {o.email}</p>{o.phone&&<p className={ui.muted}><Phone size={13}/> {o.phone}</p>}</>}
          {o.user?.id&&<Link className={ui.textLink} href={`/admin/customers/${o.user.id}`}>Open customer</Link>}
        </section>

        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h3>Shipping address</h3><span className={ui.muted}>Where this order should be delivered</span></div></div>
          {editing ? <div className={s.addressGrid}><label className={ui.fieldLabel}>First name<input className={ui.input} value={shipping.firstName} onChange={e=>setShipping({...shipping,firstName:e.target.value})}/></label><label className={ui.fieldLabel}>Last name<input className={ui.input} value={shipping.lastName} onChange={e=>setShipping({...shipping,lastName:e.target.value})}/></label><label className={`${ui.fieldLabel} ${s.full}`}>Address<input className={ui.input} value={shipping.line1} onChange={e=>setShipping({...shipping,line1:e.target.value})}/></label><label className={`${ui.fieldLabel} ${s.full}`}>Apartment / suite<input className={ui.input} value={shipping.line2} onChange={e=>setShipping({...shipping,line2:e.target.value})}/></label><label className={ui.fieldLabel}>City<input className={ui.input} value={shipping.city} onChange={e=>setShipping({...shipping,city:e.target.value})}/></label><label className={ui.fieldLabel}>Region<input className={ui.input} value={shipping.region} onChange={e=>setShipping({...shipping,region:e.target.value})}/></label><label className={ui.fieldLabel}>Postal code<input className={ui.input} value={shipping.postalCode} onChange={e=>setShipping({...shipping,postalCode:e.target.value})}/></label><label className={ui.fieldLabel}>Country<input className={ui.input} value={shipping.country} onChange={e=>setShipping({...shipping,country:e.target.value})}/></label><label className={`${ui.fieldLabel} ${s.full}`}>Phone<input className={ui.input} value={shipping.phone} onChange={e=>setShipping({...shipping,phone:e.target.value})}/></label></div> : <div className={ui.muted} style={{whiteSpace:'pre-wrap'}}><MapPin size={13}/> {addressText(o.shippingAddressJson)}{o.shippingMethod&&<p>Method: {o.shippingMethod}</p>}{o.trackingNumber&&<p>Tracking: <strong>{o.trackingNumber}</strong></p>}</div>}
        </section>

        {editing&&<section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h3>Billing address</h3><span className={ui.muted}>Leave blank to keep the existing billing destination</span></div></div><div className={s.addressGrid}><label className={ui.fieldLabel}>First name<input className={ui.input} value={billing.firstName} onChange={e=>setBilling({...billing,firstName:e.target.value})}/></label><label className={ui.fieldLabel}>Last name<input className={ui.input} value={billing.lastName} onChange={e=>setBilling({...billing,lastName:e.target.value})}/></label><label className={`${ui.fieldLabel} ${s.full}`}>Address<input className={ui.input} value={billing.line1} onChange={e=>setBilling({...billing,line1:e.target.value})}/></label><label className={`${ui.fieldLabel} ${s.full}`}>Apartment / suite<input className={ui.input} value={billing.line2} onChange={e=>setBilling({...billing,line2:e.target.value})}/></label><label className={ui.fieldLabel}>City<input className={ui.input} value={billing.city} onChange={e=>setBilling({...billing,city:e.target.value})}/></label><label className={ui.fieldLabel}>Region<input className={ui.input} value={billing.region} onChange={e=>setBilling({...billing,region:e.target.value})}/></label><label className={ui.fieldLabel}>Postal code<input className={ui.input} value={billing.postalCode} onChange={e=>setBilling({...billing,postalCode:e.target.value})}/></label><label className={ui.fieldLabel}>Country<input className={ui.input} value={billing.country} onChange={e=>setBilling({...billing,country:e.target.value})}/></label><label className={`${ui.fieldLabel} ${s.full}`}>Phone<input className={ui.input} value={billing.phone} onChange={e=>setBilling({...billing,phone:e.target.value})}/></label></div></section>}

        {editing&&<section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h3>Order note</h3><span className={ui.muted}>Visible to staff only</span></div></div><textarea className={ui.textarea} rows={5} value={notesValue} onChange={e=>setNotesValue(e.target.value)} placeholder="Add an internal order note…"/></section>}

        {!editing&&<section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Internal notes</h3></div><div className="inline" style={{alignItems:'stretch'}}><textarea className={ui.textarea} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a private note for staff…"/><button className={ui.btn} onClick={addNote} disabled={addingNote||!note.trim()}><Plus size={15}/>{addingNote?'Adding…':'Add note'}</button></div><div className={s.timeline} style={{marginTop:18}}>{(o.notesHistory||[]).map((n:any)=><div className={s.timelineItem} key={n.id}><div className={s.dot}/><div><strong>{n.user?.name||'Staff'}</strong><p>{n.body}</p><small className={ui.muted}>{new Date(n.createdAt).toLocaleString()}</small></div></div>)}{!o.notesHistory?.length&&<p className={ui.muted}>No internal notes yet.</p>}</div></section>}

        <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Order timeline</h3></div><div className={s.timeline}>{(o.events||[]).map((e:any)=><div className={s.timelineItem} key={e.id}><div className={s.dot}/><div><strong>{e.status}</strong><p className={ui.muted}>{e.message||'Order updated'}</p><small className={ui.muted}>{new Date(e.createdAt).toLocaleString()}</small></div></div>)}{!o.events?.length&&<p className={ui.muted}>No status events yet.</p>}</div></section>

        <DeliveryTrackingAdmin orderId={o.id} orderStatus={o.status}/>
      </main>

      <aside className={s.rail}>
        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Order controls</h3></div>
          <label className={ui.fieldLabel}>Order status
            <select className={ui.select} value={status} onChange={e=>setStatus(e.target.value)} disabled={statusLocked}>{availableStatuses.map(x=><option key={x}>{x}</option>)}</select>
          </label>
          {statusLocked && <p className={s.lockedNote}>This order is in a final status and can no longer be changed here.</p>}
          <label className={ui.fieldLabel}>Payment status
            <select className={ui.select} value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)} disabled={paymentLocked}>{availablePaymentStatuses.map(x=><option key={x}>{x}</option>)}</select>
          </label>
          {paymentLocked && <p className={s.lockedNote}>Refunded payments are managed from the refund workflow, not here.</p>}
          <label className={ui.fieldLabel}>Tracking number<input className={ui.input} value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="Enter tracking number"/></label>
          {!editing&&<button className={ui.btn} onClick={save} disabled={saving}><Save size={15}/>{saving?'Saving…':'Save changes'}</button>}
        </section>
        <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Customer</h3></div><strong>{o.user?.name||o.email}</strong><p className={ui.muted}><Mail size={13}/> {o.email}</p>{o.phone&&<p className={ui.muted}><Phone size={13}/> {o.phone}</p>}{o.user?.id&&<Link className={ui.textLink} href={`/admin/customers/${o.user.id}`}>Open customer</Link>}</section>
        {!editing&&<section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Shipping address</h3></div><div className={ui.muted} style={{whiteSpace:'pre-wrap'}}><MapPin size={13}/> {addressText(o.shippingAddressJson)}</div>{o.shippingMethod&&<p className={ui.muted}>Method: {o.shippingMethod}</p>}{o.trackingNumber&&<p className={ui.muted}>Tracking: <strong>{o.trackingNumber}</strong></p>}</section>}
        {!editing&&<section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Billing address</h3></div><div className={ui.muted} style={{whiteSpace:'pre-wrap'}}>{addressText(o.billingAddressJson)}</div></section>}
        <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Payment</h3></div><div className={s.summaryLine}><span>Method</span><strong>{o.paymentMethod}</strong></div><div className={s.summaryLine}><span>Status</span><span className={`${s.statusPill} ${paymentPillClass(o.paymentStatus)}`}>{o.paymentStatus}</span></div>{(o.paymentTransactions||[]).map((t:any)=><div key={t.id} className={s.summaryLine}><span>{t.provider}{t.externalId?` • ${t.externalId}`:''}</span><span>{t.status} · {money(t.amount,t.currency)}</span></div>)}</section>
        <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Order information</h3></div><div className={s.summaryLine}><span>Currency</span><strong>{o.currency}</strong></div><div className={s.summaryLine}><span>Coupon</span><strong>{o.couponCode||'—'}</strong></div><div className={s.summaryLine}><span>Created</span><strong>{new Date(o.createdAt).toLocaleDateString()}</strong></div><div className={s.summaryLine}><span>Updated</span><strong>{new Date(o.updatedAt).toLocaleString()}</strong></div></section>
      </aside>
    </div>
  </div>
}
