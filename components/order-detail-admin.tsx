'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/admin-link'
import { AlertTriangle, ArrowLeft, Ban, Check, ChevronDown, Copy, FileEdit, FileText, Gift, Mail, MapPin, MessageCircle, MoreHorizontal, PackageCheck, Pencil, Phone, Plus, Save, Send, SlidersHorizontal, Truck, X, XCircle } from 'lucide-react'
import { money } from '@/lib/config'
import { formatAdminDate, formatAdminDateTime } from '@/lib/admin-datetime'
import { canTransitionOrder, canTransitionPayment } from '@/lib/orders'
import { JOURNEY, addressLines, customerName, customerPhone, driverShareLink, mapsLink, nextStep, orderPin, paymentInfo, paymentMethodLabel, statusInfo, telLink } from '@/lib/order-flow'
import s from './order-detail-admin.module.css'
import ui from './admin-ui.module.css'
import { CountrySelect } from './field-selects'
import DeliveryTrackingAdmin from './delivery-tracking-admin'
import { WHATSAPP_OUTCOMES, whatsappConfirmLink, whatsappPhoneProblem } from '@/lib/whatsapp-confirm'
import { internationalPhone } from '@/lib/phone'
import { reviewRequestMessage } from '@/lib/order-reviews'
import { customerUpdateLink, updateForStatus } from '@/lib/order-updates'
import type { PhoneHistory } from '@/lib/customer-history'
import type { Risk } from '@/lib/order-risk'
import { useConfirm } from './admin-confirm'
import AdminMenu from './admin-menu'
import { safeHttpUrl } from '@/lib/safe-url'

// Admin > Orders > one order. Top to bottom: the order number and where it stands, the progress
// line, the one thing to do next, then the customer, what was bought and paid, and the parcels.
// Notes and history run down the side. Changing a status by hand is for corrections only and sits
// behind "Fix status by hand" in the menu. Every action calls the same routes as before.

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// REFUNDED (order) and the refunded payment states only come from the refund workflow; the
// server rejects them here, so they are never offered.
const ORDER_STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const
const PAYMENT_STATUS_OPTIONS = ['UNPAID', 'PENDING', 'PAID', 'FAILED'] as const
const PAYMENT_STATUS_WORDS: Record<string, string> = { UNPAID: 'Not paid', PENDING: 'Payment pending', PAID: 'Paid', FAILED: 'Payment failed', PARTIALLY_REFUNDED: 'Partly refunded', REFUNDED: 'Refunded' }

// Short button labels for the answers in lib/whatsapp-confirm.ts.
const WHATSAPP_ANSWER_LABELS: Record<keyof typeof WHATSAPP_OUTCOMES, string> = { confirmed: 'Confirmed', no_answer: 'No answer yet', change_requested: 'Wants a change', cancel_requested: 'Wants to cancel', wrong_number: 'Wrong number' }

const TONE: Record<string, string> = { warning: s.toneWarning, info: s.toneInfo, success: s.toneSuccess, danger: s.toneDanger, neutral: s.toneNeutral }

function parseAddress(raw: string | null | undefined) {
  if (!raw) return { firstName:'', lastName:'', line1:'', line2:'', city:'', region:'', postalCode:'', country:'', phone:'' }
  try { const a = JSON.parse(raw); return { firstName:a.firstName||'', lastName:a.lastName||'', line1:a.line1||'', line2:a.line2||'', city:a.city||'', region:a.region||'', postalCode:a.postalCode||'', country:a.country||'', phone:a.phone||'' } } catch { return { firstName:'', lastName:'', line1:raw, line2:'', city:'', region:'', postalCode:'', country:'', phone:'' } }
}
function addressText(raw: string | null | undefined) {
  const a = parseAddress(raw)
  return [`${a.firstName} ${a.lastName}`.trim(),a.line1,a.line2,[a.city,a.region,a.postalCode].filter(Boolean).join(', '),a.country,a.phone].filter(Boolean).join('\n')
}

// The order's "More" menu (components/admin-menu.tsx: keyboard, focus and Escape).
function Menu({ children }: { children: React.ReactNode }) {
  return <AdminMenu className={s.menuWrap} buttonClassName={`${ui.btn} ${ui.btnSecondary}`} menuClassName={s.menu} label="More actions for this order"
    content={<><MoreHorizontal size={16} aria-hidden="true"/> More <ChevronDown size={14} aria-hidden="true"/></>}>{children}</AdminMenu>
}

export default function OrderDetailAdmin({ initial, canStartOrderEdit, storeTimezone, storeName = '', storeCountry = 'Lebanon', phoneBlocked = false, reviewLink = '', trackLink = '', history = null, risk = null }: { initial: any; canStartOrderEdit?: boolean; storeTimezone?: string; storeName?: string; storeCountry?: string; phoneBlocked?: boolean; reviewLink?: string; trackLink?: string; history?: PhoneHistory | null; risk?: Risk | null }) {
  const [o, setO] = useState(initial)
  const confirm = useConfirm()
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [msgIsError, setMsgIsError] = useState(false)
  const say = (text: string, error = false) => { setMsg(text); setMsgIsError(error) }

  const [blocked, setBlocked] = useState(phoneBlocked)
  const phoneNumber = customerPhone(o)
  // Block a customer who keeps refusing cash-on-delivery parcels: their number can't order online.
  async function toggleBlock() {
    if (!phoneNumber) return
    if (!blocked && !(await confirm({ title: `Block ${phoneNumber}?`, message: "This number won't be able to place new orders on the store. You can unblock it any time in Settings › Security.", confirmLabel: 'Block number' }))) return
    try {
      await api('/api/admin/blocked-phones', { method: 'POST', body: JSON.stringify(blocked ? { phone: phoneNumber, unblock: true } : { phone: phoneNumber, note: `Order #${o.orderNumber}` }) })
      setBlocked(!blocked); say(blocked ? 'Number unblocked.' : 'Number blocked from ordering.')
    } catch (e) { say(e instanceof Error ? e.message : 'Could not update', true) }
  }

  // WhatsApp: the "please confirm" message for new orders, a plain chat otherwise.
  const confirmLink = useMemo(() => whatsappConfirmLink(o, storeName, storeCountry, money), [o, storeName, storeCountry])
  const chatLink = useMemo(() => { const digits = internationalPhone(phoneNumber, storeCountry); return digits ? `https://wa.me/${digits}` : '' }, [phoneNumber, storeCountry])
  const reviewWhatsapp = useMemo(() => {
    const digits = internationalPhone(phoneNumber, storeCountry)
    if (!reviewLink || !digits) return ''
    let address: any = {}
    try { address = JSON.parse(o.shippingAddressJson || '{}') || {} } catch {}
    const firstName = String(address.firstName || o.user?.name || '').trim().split(/\s+/)[0] || ''
    return `https://wa.me/${digits}?text=${encodeURIComponent(reviewRequestMessage({ storeName, firstName, orderNumber: String(o.orderNumber), link: reviewLink }))}`
  }, [reviewLink, phoneNumber, storeCountry, storeName, o])
  // One-tap WhatsApp update for the customer: "confirmed" or "on the way" (lib/order-updates.ts).
  const updateKind = updateForStatus(o.status)
  const updateLink = useMemo(() => updateKind ? customerUpdateLink(updateKind, o, storeName, storeCountry, money, trackLink) : '', [updateKind, o, storeName, storeCountry, trackLink])
  const reviewEmailSent = (o.events || []).some((e: any) => String(e.message || '').startsWith('Review request sent by email'))
  const whatsappProblem = useMemo(() => confirmLink ? '' : whatsappPhoneProblem(o, storeCountry), [o, confirmLink, storeCountry])
  const call = telLink(o, storeCountry)
  const map = mapsLink(o)
  const lines = addressLines(o)

  // After the chat, staff record what the customer said (a note); the status is theirs to change.
  const [recordingAnswer, setRecordingAnswer] = useState('')
  const [lastAnswer, setLastAnswer] = useState('')
  async function recordWhatsappAnswer(outcome: string) {
    setRecordingAnswer(outcome); say('')
    try {
      const d = await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id: o.id, whatsappOutcome: outcome }) })
      setO((c: any) => ({ ...c, notesHistory: [d.note, ...(c.notesHistory || [])], events: [d.event, ...(c.events || [])] }))
      setLastAnswer(outcome)
      say(outcome === 'confirmed' ? 'Answer saved. Now tap "Confirm order" to move the order on.' : 'Answer saved as a note on this order.')
    } catch (e) { say(e instanceof Error ? e.message : 'Could not save the answer', true) }
    finally { setRecordingAnswer('') }
  }

  // Moving the order along (the next-step button, cancel, mark paid): one PATCH, the server's
  // answer replaces the local copy. True when it saved, so a panel stays open when it didn't.
  const [moving, setMoving] = useState(false)
  async function patch(data: Record<string, unknown>, done: (d: any) => string) {
    setMoving(true); say('')
    try {
      const d = await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id: o.id, ...data }) })
      const next = { ...o, ...data, ...(d.order || {}) }
      setO(next); setStatus(next.status); setPaymentStatus(next.paymentStatus)
      say(done(d))
      // The page reloads its data from the server (history, parcels), see the effect below.
      router.refresh()
      return true
    } catch (e) { say(e instanceof Error ? e.message : 'Unable to update order', true); return false }
    finally { setMoving(false) }
  }
  const step = nextStep(o, money)
  async function advance() {
    if (!step) return
    if (!(await confirm({ title: step.confirmTitle, message: step.confirmMessage, confirmLabel: step.label, tone: 'default' }))) return
    await patch({ status: step.to }, () => `Order is now ${statusInfo(step.to).label.toLowerCase()}.`)
    setLastAnswer('')
  }
  async function cancelOrder() {
    const paid = o.paymentStatus === 'PAID' || o.paymentStatus === 'PARTIALLY_REFUNDED'
    if (!(await confirm({ title: `Cancel #${o.orderNumber}?`, message: `Reserved stock goes back on sale${o.status === 'SHIPPED' ? ' (the returned parcel goes back in stock)' : ''}.${paid ? ' The paid amount is refunded.' : ''} This can't be undone.`, confirmLabel: 'Cancel order' }))) return
    await patch({ status: 'CANCELLED' }, d => d.cancelRefund ? `Order cancelled. A ${money(d.cancelRefund.amount, o.currency)} refund ${d.cancelRefund.pending ? 'is being processed' : 'was issued'}.` : 'Order cancelled.')
  }
  const canMarkPaid = !['CANCELLED', 'REFUNDED'].includes(o.status) && o.paymentMethod !== 'COD' && canTransitionPayment(o.paymentStatus, 'PAID') && o.paymentStatus !== 'PAID'
  async function markPaid() {
    if (!(await confirm({ title: `Mark #${o.orderNumber} as paid?`, message: `Only once ${money(o.grandTotal, o.currency)} has really arrived (${paymentMethodLabel(o.paymentMethod).toLowerCase()}).`, confirmLabel: 'Mark as paid', tone: 'default' }))) return
    await patch({ paymentStatus: 'PAID' }, () => 'Payment recorded.')
  }

  // Corrections by hand, and the edit form for contact, addresses and the staff note.
  const [status, setStatus] = useState(o.status)
  const [paymentStatus, setPaymentStatus] = useState(o.paymentStatus)
  const [tracking, setTracking] = useState(o.trackingNumber || '')
  const [trackingCompany, setTrackingCompany] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [fulfillments, setFulfillments] = useState<any[]>(o.fulfillments || [])
  const [markingDelivered, setMarkingDelivered] = useState<string | null>(null)
  const [email, setEmail] = useState(o.email || '')
  const [phone, setPhone] = useState(o.phone || '')
  const [shipping, setShipping] = useState(parseAddress(o.shippingAddressJson))
  const [billing, setBilling] = useState(parseAddress(o.billingAddressJson))
  const [notesValue, setNotesValue] = useState(o.notes || '')
  const [editing, setEditing] = useState(false)
  const [manual, setManual] = useState(false)
  const [trackingOpen, setTrackingOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [copied, setCopied] = useState('')
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
  function beginEdit(){ setEmail(o.email||''); setPhone(o.phone||''); setShipping(parseAddress(o.shippingAddressJson)); setBilling(parseAddress(o.billingAddressJson)); setNotesValue(o.notes||''); setEditing(true); say(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function saveDetails(){
    setSaving(true); say('')
    try {
      const body = { id:o.id, email, phone, shippingAddressJson:addressPayload(shipping), billingAddressJson:(billing.line1||billing.city||billing.country)?addressPayload(billing):null, notes:notesValue }
      const d = await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify(body)})
      setO({ ...o, email, phone, shippingAddressJson: body.shippingAddressJson, billingAddressJson: body.billingAddressJson, notes: notesValue, ...(d.order || {}) })
      setEditing(false); say('Details saved.')
    } catch(e){ say(e instanceof Error?e.message:'Unable to update order', true) } finally { setSaving(false) }
  }
  async function saveManual(){
    if (status !== o.status || paymentStatus !== o.paymentStatus) {
      if (!(await confirm({ title: 'Change the status by hand?', message: `${status !== o.status ? `Order: ${statusInfo(o.status).label} → ${statusInfo(status).label}. ` : ''}${paymentStatus !== o.paymentStatus ? `Payment: ${PAYMENT_STATUS_WORDS[o.paymentStatus]} → ${PAYMENT_STATUS_WORDS[paymentStatus]}. ` : ''}This can't be undone.`, confirmLabel: 'Change', tone: 'default' }))) return
    }
    if (await patch({ status, paymentStatus, trackingNumber: tracking, trackingCompany, trackingUrl }, d => d.cancelRefund ? `Saved. A ${money(d.cancelRefund.amount, o.currency)} refund ${d.cancelRefund.pending ? 'is being processed' : 'was issued'}.` : 'Saved.')) setManual(false)
  }
  // Both panels stay open when the save fails, with what was typed (the reason shows above them).
  async function saveTracking(){
    if (await patch({ trackingNumber: tracking, ...(trackingCompany ? { trackingCompany } : {}) }, () => 'Tracking number saved.')) setTrackingOpen(false)
  }
  async function addNote(){const value=note.trim();if(!value)return;setAddingNote(true);say('');try{const d=await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify({id:o.id,addNote:value})});setO((c:any)=>({...c,notesHistory:[d.note,...(c.notesHistory||[])]}));setNote('');say('Note added.')}catch(e){say(e instanceof Error?e.message:'Unable to add note', true)}finally{setAddingNote(false)}}
  async function copy(text: string, what: string){try{await navigator.clipboard.writeText(text);setCopied(what);window.setTimeout(()=>setCopied(''),1500)}catch{}}
  async function markDelivered(fulfillmentId:string){
    setMarkingDelivered(fulfillmentId); say('')
    try {
      const d = await api(`/api/admin/fulfillments/${fulfillmentId}`,{method:'PATCH',body:JSON.stringify({status:'DELIVERED'})})
      setFulfillments((current:any[])=>current.map(f=>f.id===fulfillmentId?d.fulfillment:f))
      if (d.order) { setO((c:any)=>({...c,status:d.order.status,fulfillmentStatus:d.order.fulfillmentStatus,paymentStatus:d.order.paymentStatus??c.paymentStatus})); setStatus(d.order.status); say('Parcel delivered: order marked delivered.') }
    } catch(e){ say(e instanceof Error?e.message:'Unable to update shipment', true) }
    finally { setMarkingDelivered(null) }
  }

  // After router.refresh() the server sends the order again: take it (history, parcels, totals).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    setO(initial); setStatus(initial.status); setPaymentStatus(initial.paymentStatus); setFulfillments(initial.fulfillments || [])
  }, [initial])

  const info = statusInfo(o.status)
  const payment = paymentInfo(o)
  const closed = ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)
  const stage = JOURNEY.indexOf(o.status as typeof JOURNEY[number])
  const collect = o.paymentMethod === 'COD' && (o.paymentStatus === 'UNPAID' || o.paymentStatus === 'PENDING') && !['CANCELLED', 'REFUNDED'].includes(o.status)
  const billingText = addressText(o.billingAddressJson)

  return <div className={s.page}>
    <div className={s.bar}>
      <Link className={s.back} href="/admin/orders"><ArrowLeft size={15}/> All orders</Link>
      <Menu>
        <Link role="menuitem" href={`/admin/orders/${o.id}/invoice`}><FileText size={15}/> Invoice / print</Link>
        <Link role="menuitem" href={`/admin/orders/packing-slips?ids=${o.id}`}><FileText size={15}/> Packing slip (no prices)</Link>
        <button role="menuitem" type="button" onClick={beginEdit}><Pencil size={15}/> Edit contact &amp; address</button>
        {canStartOrderEdit && <Link role="menuitem" href={`/admin/order-edits/new?orderId=${o.id}`}><FileEdit size={15}/> Change items</Link>}
        {!closed && <button role="menuitem" type="button" onClick={() => { setTracking(o.trackingNumber || ''); setTrackingOpen(true) }}><Truck size={15}/> Tracking number</button>}
        {!closed && <a role="menuitem" href={driverShareLink(o, storeName, money)} target="_blank" rel="noreferrer"><Send size={15}/> Send to driver (WhatsApp)</a>}
        <button role="menuitem" type="button" onClick={() => { setStatus(o.status); setPaymentStatus(o.paymentStatus); setTracking(o.trackingNumber || ''); setManual(true) }}><SlidersHorizontal size={15}/> Fix status by hand</button>
        {canTransitionOrder(o.status, 'CANCELLED') && o.status !== 'CANCELLED' && <button role="menuitem" type="button" className={s.danger} onClick={cancelOrder}><XCircle size={15}/> Cancel order</button>}
      </Menu>
    </div>

    <header className={s.head}>
      <div>
        <p className={s.kicker}>Order</p>
        <div className={s.orderRow}>
          <h1 className={s.orderNo} data-admin-title={`Order #${o.orderNumber}`}>#{o.orderNumber}</h1>
          <button type="button" className={s.iconBtn} onClick={() => copy(String(o.orderNumber), 'number')} aria-label="Copy order number">{copied === 'number' ? <Check size={15}/> : <Copy size={15}/>}</button>
        </div>
        <p className={s.meta}>Placed {formatAdminDateTime(o.createdAt, storeTimezone)}{o.isGift ? ' · Gift order' : ''}</p>
      </div>
      <div className={s.tags}>
        <span className={`${s.tag} ${TONE[info.tone]}`}>{info.label}</span>
        <span className={`${s.tag} ${TONE[payment.tone]}`}>{payment.label}</span>
      </div>
    </header>

    {msg && <div className={`${ui.alert} ${msgIsError ? ui.alertDanger : ''}`} role="status">{msg}</div>}

    {risk && <section className={`${s.risk}${risk.level === 'high' ? ` ${s.riskHigh}` : ''}`} aria-label="Risky order">
      <AlertTriangle size={20} aria-hidden="true" />
      <div className={s.riskBody}>
        <strong>{risk.headline}</strong>
        <ul>{risk.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        <span className={ui.muted}>{risk.context}. Cash on delivery: a short call now saves a wasted trip.</span>
        <div className={s.actions}>
          {call && <a className={`${ui.btn} ${ui.btnSecondary}`} href={call}><Phone size={15}/> Call</a>}
          {chatLink && <a className={`${ui.btn} ${ui.btnSecondary}`} href={chatLink} target="_blank" rel="noreferrer"><MessageCircle size={15}/> WhatsApp</a>}
          {phoneNumber && !blocked && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={toggleBlock}><Ban size={15}/> Block this number</button>}
        </div>
      </div>
    </section>}

    {o.status === 'CANCELLED' || o.status === 'REFUNDED'
      ? <div className={`${s.closed} ${o.status === 'CANCELLED' ? s.closedCancelled : ''}`}><XCircle size={18}/> This order was {o.status === 'CANCELLED' ? 'cancelled' : 'refunded'}. Nothing more to do.</div>
      : <ol className={s.stages} aria-label="Order progress">
          {JOURNEY.map((st, i) => <li key={st} className={`${s.stage}${i < stage ? ` ${s.stageDone}` : ''}${i === stage ? ` ${s.stageNow}` : ''}`} aria-current={i === stage ? 'step' : undefined}><span className={s.stageNo}>{i < stage ? <Check size={12}/> : i + 1}</span>{statusInfo(st).label}</li>)}
        </ol>}

    {editing && <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Editing contact &amp; address</h2>
        <div className={s.actions}>
          <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditing(false)} disabled={saving}><X size={15}/> Cancel</button>
          <button className={ui.btn} onClick={saveDetails} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </section>}

    {!editing && !closed && <section className={s.action} aria-labelledby="order-next-step">
      <div className={s.actionHead}>
        <span className={s.kicker}>Next step</span>
        <p id="order-next-step" className={s.actionTitle} role="heading" aria-level={2}>{info.hint}</p>
      </div>
      <div className={s.actionBody}>
        {o.status === 'PENDING' && <div className={s.steps}>
          <div className={s.step}>
            <span className={s.stepNo}>1</span>
            <div className={s.stepBody}>
              <span className={s.stepLabel}>Ask the customer on WhatsApp</span>
              {confirmLink
                ? <div className={s.actions}><a className={`${ui.btn} ${s.whatsapp}`} href={confirmLink} target="_blank" rel="noreferrer"><MessageCircle size={16}/> Open the confirm message</a></div>
                : whatsappProblem ? <div className={s.warning} role="note"><Phone size={16}/><span>{whatsappProblem}</span></div> : null}
            </div>
          </div>
          <div className={s.step}>
            <span className={s.stepNo}>2</span>
            <div className={s.stepBody}>
              <span className={s.stepLabel}>What did they answer?</span>
              <div className={s.choices}>{(Object.keys(WHATSAPP_OUTCOMES) as Array<keyof typeof WHATSAPP_OUTCOMES>).map(k => <button key={k} type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}${lastAnswer === k ? ` ${s.chosen}` : ''}`} disabled={!!recordingAnswer} aria-pressed={lastAnswer === k} onClick={() => recordWhatsappAnswer(k)}>{recordingAnswer === k ? 'Saving…' : WHATSAPP_ANSWER_LABELS[k]}</button>)}</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={s.stepNo}>3</span>
            <div className={s.stepBody}>
              <span className={s.stepLabel}>Move the order on</span>
              <div className={s.actions}>{step && <button type="button" className={`${ui.btn} ${s.primary}`} disabled={moving} onClick={advance}>{moving ? 'Saving…' : `3. ${step.label}`}</button>}</div>
            </div>
          </div>
        </div>}

        {o.status !== 'PENDING' && <div className={s.actions}>
          {step && <button type="button" className={`${ui.btn} ${s.primary}`} disabled={moving} onClick={advance}>{moving ? 'Saving…' : step.label}</button>}
          <a className={`${ui.btn} ${ui.btnSecondary}`} href={driverShareLink(o, storeName, money)} target="_blank" rel="noreferrer"><Send size={15}/> Send to driver</a>
        </div>}

        {updateLink && <div className={s.actions}><a className={`${ui.btn} ${ui.btnSecondary}`} href={updateLink} target="_blank" rel="noreferrer"><MessageCircle size={15}/> {updateKind === 'on_the_way' ? "Tell the customer it's on the way" : "Tell the customer it's confirmed"}</a></div>}
        {lastAnswer === 'cancel_requested' && <div className={s.actions}><button type="button" className={`${ui.btn} ${ui.btnDanger}`} onClick={cancelOrder} disabled={moving}><XCircle size={15}/> Cancel this order</button></div>}
      </div>
    </section>}

    {/* Delivered: ask the customer to rate what they bought (app/review/[orderNumber]). */}
    {!editing && o.status === 'DELIVERED' && reviewLink && <section className={s.action}>
      <div className={s.actionHead}><span className={s.kicker}>Delivered</span><p className={s.actionTitle} role="heading" aria-level={2}>Ask for a review</p></div>
      <div className={s.actionBody}>
        <p className={s.lede}>Send the customer a link to rate what they bought. Reviews show on the product page after you approve them in Reviews.{reviewEmailSent ? ' A review email was already sent to this customer.' : o.email ? ' Customers with an email also get it by email 1 day after delivery.' : ''}</p>
        <div className={s.actions}>
          {reviewWhatsapp && <a className={`${ui.btn} ${s.whatsapp}`} href={reviewWhatsapp} target="_blank" rel="noreferrer"><MessageCircle size={16}/> Ask for a review on WhatsApp</a>}
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => copy(reviewLink, 'review')}>{copied === 'review' ? <Check size={15}/> : <Copy size={15}/>} {copied === 'review' ? 'Link copied' : 'Copy review link'}</button>
        </div>
      </div>
    </section>}

    {trackingOpen && <section className={s.panel}>
      <div className={s.panelHead}><h2 className={s.panelTitle}>Tracking number</h2></div>
      <div className={s.panelBody}>
        <div className={s.two}>
          <label className={ui.fieldLabel}>Tracking number<input className={ui.input} autoFocus maxLength={120} value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="From the delivery company"/></label>
          <label className={ui.fieldLabel}>Delivery company<input className={ui.input} maxLength={120} value={trackingCompany} onChange={e=>setTrackingCompany(e.target.value)} placeholder="Aramex, DHL, LibanPost…"/></label>
        </div>
        <div className={s.actions}><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={()=>setTrackingOpen(false)}>Close</button><button className={ui.btn} onClick={saveTracking} disabled={moving}><Save size={15}/> Save</button></div>
      </div>
    </section>}

    {manual && <section className={s.panel}>
      <div className={s.panelHead}><h2 className={s.panelTitle}>Fix status by hand</h2></div>
      <div className={s.panelBody}>
        <p className={s.lede}>For corrections only. To move an order forward, use the next step above.</p>
        <div className={s.two}>
          <label className={ui.fieldLabel}>Order status
            <select className={ui.select} value={status} onChange={e=>setStatus(e.target.value)} disabled={statusLocked}>{availableStatuses.map(x=><option key={x} value={x}>{statusInfo(x).label}</option>)}</select>
          </label>
          <label className={ui.fieldLabel}>Payment
            <select className={ui.select} value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)} disabled={paymentLocked}>{availablePaymentStatuses.map(x=><option key={x} value={x}>{PAYMENT_STATUS_WORDS[x] || x}</option>)}</select>
          </label>
        </div>
        {statusLocked && <p className={ui.muted}>This order's status can't change any more.</p>}
        {paymentLocked && <p className={ui.muted}>Refunds are handled from the refund screen, not here.</p>}
        {status === 'SHIPPED' && o.status !== 'SHIPPED' && <div className={s.two}>
          <label className={ui.fieldLabel}>Tracking number<input className={ui.input} value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="Optional"/></label>
          <label className={ui.fieldLabel}>Delivery company<input className={ui.input} value={trackingCompany} onChange={e=>setTrackingCompany(e.target.value)} placeholder="Optional"/></label>
          <label className={`${ui.fieldLabel} ${s.full}`}>Tracking link<input className={ui.input} value={trackingUrl} onChange={e=>setTrackingUrl(e.target.value)} placeholder="https://…"/></label>
        </div>}
        <div className={s.actions}><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={()=>setManual(false)}>Close</button><button className={ui.btn} onClick={saveManual} disabled={moving}><Save size={15}/>{moving ? 'Saving…' : 'Save'}</button></div>
      </div>
    </section>}

    <div className={s.layout}>
      {/* Not a second <main>: the order sits in the admin's own main landmark. */}
      <div className={s.main}>
        {editing && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Contact</h2></div>
          <div className={s.panelBody}>
            <div className={s.two}>
              <label className={ui.fieldLabel}>Email<input className={ui.input} value={email} onChange={e=>setEmail(e.target.value)} /></label>
              <label className={ui.fieldLabel}>Phone<input className={ui.input} value={phone} onChange={e=>setPhone(e.target.value)} /></label>
            </div>
          </div>
        </section>}
        {editing && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Delivery address</h2></div>
          <div className={s.panelBody}>
            <div className={s.two}>
              <label className={ui.fieldLabel}>First name<input className={ui.input} value={shipping.firstName} onChange={e=>setShipping({...shipping,firstName:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Last name<input className={ui.input} value={shipping.lastName} onChange={e=>setShipping({...shipping,lastName:e.target.value})}/></label>
              <label className={`${ui.fieldLabel} ${s.full}`}>Address<input className={ui.input} value={shipping.line1} onChange={e=>setShipping({...shipping,line1:e.target.value})}/></label>
              <label className={`${ui.fieldLabel} ${s.full}`}>Building / floor<input className={ui.input} value={shipping.line2} onChange={e=>setShipping({...shipping,line2:e.target.value})}/></label>
              <label className={ui.fieldLabel}>City<input className={ui.input} value={shipping.city} onChange={e=>setShipping({...shipping,city:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Region<input className={ui.input} value={shipping.region} onChange={e=>setShipping({...shipping,region:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Postal code<input className={ui.input} value={shipping.postalCode} onChange={e=>setShipping({...shipping,postalCode:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Country<CountrySelect className={ui.select} value={shipping.country} onChange={v=>setShipping({...shipping,country:v})}/></label>
              <label className={`${ui.fieldLabel} ${s.full}`}>Phone<input className={ui.input} value={shipping.phone} onChange={e=>setShipping({...shipping,phone:e.target.value})}/></label>
            </div>
          </div>
        </section>}
        {editing && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Billing address <span className={ui.muted}>(optional)</span></h2></div>
          <div className={s.panelBody}>
            <div className={s.two}>
              <label className={ui.fieldLabel}>First name<input className={ui.input} value={billing.firstName} onChange={e=>setBilling({...billing,firstName:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Last name<input className={ui.input} value={billing.lastName} onChange={e=>setBilling({...billing,lastName:e.target.value})}/></label>
              <label className={`${ui.fieldLabel} ${s.full}`}>Address<input className={ui.input} value={billing.line1} onChange={e=>setBilling({...billing,line1:e.target.value})}/></label>
              <label className={`${ui.fieldLabel} ${s.full}`}>Building / floor<input className={ui.input} value={billing.line2} onChange={e=>setBilling({...billing,line2:e.target.value})}/></label>
              <label className={ui.fieldLabel}>City<input className={ui.input} value={billing.city} onChange={e=>setBilling({...billing,city:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Region<input className={ui.input} value={billing.region} onChange={e=>setBilling({...billing,region:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Postal code<input className={ui.input} value={billing.postalCode} onChange={e=>setBilling({...billing,postalCode:e.target.value})}/></label>
              <label className={ui.fieldLabel}>Country<CountrySelect className={ui.select} value={billing.country} onChange={v=>setBilling({...billing,country:v})}/></label>
              <label className={`${ui.fieldLabel} ${s.full}`}>Phone<input className={ui.input} value={billing.phone} onChange={e=>setBilling({...billing,phone:e.target.value})}/></label>
            </div>
          </div>
        </section>}
        {editing && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Staff note <span className={ui.muted}>(only staff see it)</span></h2></div>
          <div className={s.panelBody}><textarea className={ui.textarea} rows={4} value={notesValue} onChange={e=>setNotesValue(e.target.value)} placeholder="A note about this order for the team…" aria-label="Staff note"/></div>
        </section>}
        {/* Save and Cancel at the end of the form too: they were only at the top, a long scroll back from the last field. */}
        {editing && <div className={`${s.actions} ${s.editEnd}`}>
          <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditing(false)} disabled={saving}><X size={15}/> Cancel</button>
          <button className={ui.btn} onClick={saveDetails} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save'}</button>
        </div>}

        {!editing && <section className={s.panel}>
          <div className={s.panelHead}>
            <h2 className={s.panelTitle}>Customer and delivery</h2>
            {blocked && <span className={s.blockedNote}>Blocked from ordering</span>}
          </div>
          <div className={s.panelBody}>
            <div className={s.two}>
              <div className={s.kv}>
                <span className={s.kvLabel}>Customer</span>
                <strong className={s.name}>{customerName(o)}</strong>
                {phoneNumber && <span className={s.line}><Phone size={14}/> <span>{phoneNumber}</span></span>}
                {o.email && <span className={s.line}><Mail size={14}/> <span className={s.wrap}>{o.email}</span></span>}
                <div className={s.actions}>
                  {call && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={call}><Phone size={14}/> Call</a>}
                  {chatLink && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={chatLink} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WhatsApp</a>}
                </div>
              </div>
              <div className={s.kv}>
                <span className={s.kvLabel}>Deliver to</span>
                <span className={s.line}><MapPin size={14}/> <span className={s.wrap}>{lines.length ? lines.join(', ') : 'No delivery address'}</span></span>
                {o.shippingMethod && <span className={ui.muted}>Method: {o.shippingMethod}</span>}
                {o.trackingNumber && <span className={ui.muted}>Tracking: <strong>{o.trackingNumber}</strong></span>}
                <div className={s.actions}>
                  {map && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={map} target="_blank" rel="noreferrer"><MapPin size={14}/> {orderPin(o) ? 'Open exact location' : 'Open in Maps'}</a>}
                  {lines.length > 0 && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => copy([customerName(o), phoneNumber, ...lines].filter(Boolean).join('\n'), 'address')}>{copied === 'address' ? <Check size={14}/> : <Copy size={14}/>} {copied === 'address' ? 'Copied' : 'Copy address'}</button>}
                </div>
              </div>
            </div>
            {billingText && billingText !== addressText(o.shippingAddressJson) && <div className={s.kv}><span className={s.kvLabel}>Billing address</span><span className={s.pre}>{billingText}</span></div>}
            {o.driver && <div className={s.note}><Truck size={16}/><div><strong>Driver: {o.driver.name}</strong>{o.cashCollected ? <span className={ui.muted}>Collected {money(o.cashCollected, o.currency)} cash · {o.cashSettledAt ? 'handed to the store' : 'not handed over yet'}</span> : <span className={ui.muted}>{o.status === 'DELIVERED' ? 'Delivered, nothing to collect' : 'On their delivery list'}</span>} <Link className={ui.textLink} href="/admin/orders/drivers">Drivers</Link></div></div>}
            {o.isGift && <div className={s.note}><Gift size={16}/><div><strong>Gift order</strong>{o.giftMessage ? <span className={s.pre}>"{o.giftMessage}"</span> : <span className={ui.muted}>No message. Don't put prices in the parcel.</span>}</div></div>}
            {history && <div className={`${s.history}${history.warning ? ` ${s.historyWarn}` : ''}`}>
              <strong>{history.total ? `Ordered ${history.total} time${history.total === 1 ? '' : 's'} before with this phone` : 'First order from this phone number'}</strong>
              {history.total > 0 && <span>{[history.delivered ? `${history.delivered} delivered` : '', history.cancelled ? `${history.cancelled} cancelled` : '', history.open ? `${history.open} in progress` : ''].filter(Boolean).join(' · ')}</span>}
              {history.warning && <span className={s.historyNote}>{history.warning}</span>}
              {history.total > 0 && <ul>{history.orders.slice(0, 5).map(h => <li key={h.id}><Link href={`/admin/orders/${h.id}`}>#{h.orderNumber}</Link> · {statusInfo(h.status).label}{h.refused ? ' (after sending)' : ''} · {money(h.grandTotal, h.currency)} · {formatAdminDate(h.createdAt, storeTimezone)}</li>)}</ul>}
            </div>}
            <div className={s.panelFoot}>
              {o.user?.id && <Link className={ui.textLink} href={`/admin/customers/${o.user.id}`}>Customer's account and past orders</Link>}
              {phoneNumber && <button type="button" className={`${s.linkBtn}${blocked ? '' : ` ${s.danger}`}`} onClick={toggleBlock}><Ban size={13}/> {blocked ? 'Unblock this number' : 'Block this number from ordering'}</button>}
            </div>
          </div>
        </section>}

        <section className={s.panel}>
          <div className={s.panelHead}>
            <h2 className={s.panelTitle}>Items</h2>
            <span className={ui.muted}>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>Item</th><th className={s.num}>Qty</th><th className={s.num}>Total</th></tr></thead>
              <tbody>{(o.items || []).map((x: any) => <tr key={x.id}>
                <td>
                  <div className={s.itemCell}>
                    <div className={s.thumb}>{x.product?.images?.[0]?.url ? <img src={x.product.images[0].url} alt=""/> : <PackageCheck size={16}/>}</div>
                    <div>
                      <strong>{x.name}</strong>
                      <div className={ui.muted}>{[x.variant?.name && x.variant.name !== 'Default Title' ? x.variant.name : '', x.sku].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                </td>
                <td className={s.num}>× {x.quantity}</td>
                <td className={s.num}>{money(x.totalPrice, o.currency)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className={s.totals}>
            <div className={s.ledger}>
              <div className={s.ledgerRow}><span>Subtotal</span><span>{money(o.subtotal, o.currency)}</span></div>
              {o.discountTotal > 0 && <div className={s.ledgerRow}><span>Discount{o.couponCode ? ` (${o.couponCode})` : ''}</span><span>− {money(o.discountTotal, o.currency)}</span></div>}
              <div className={s.ledgerRow}><span>Delivery</span><span>{o.shippingTotal > 0 ? money(o.shippingTotal, o.currency) : 'Free'}</span></div>
              {o.taxTotal > 0 && <div className={s.ledgerRow}><span>Tax</span><span>{money(o.taxTotal, o.currency)}</span></div>}
              <div className={`${s.ledgerRow} ${s.ledgerTotal}`}><span>Total</span><span>{money(o.grandTotal, o.currency)}</span></div>
            </div>
          </div>
          <div className={`${s.payStrip} ${TONE[payment.tone]}`}>
            <span>{collect ? <>Driver collects <strong>{money(o.grandTotal, o.currency)}</strong> in cash</> : payment.label}</span>
            {canMarkPaid && <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={markPaid} disabled={moving}><Check size={14}/> Mark as paid</button>}
          </div>
          {(o.paymentProofs || []).length > 0 && <div className={s.proofBox}>
            <p className={s.proofText}><strong>{o.paymentProofs.length} payment screenshot{o.paymentProofs.length === 1 ? '' : 's'} from the customer.</strong>{canMarkPaid ? ' Check that the money really arrived, then tap Mark as paid.' : ''} <span className={ui.muted}>Only staff can see these.</span></p>
            <div className={s.proofs}>{o.paymentProofs.map((p: any) => <a key={p.id} className={s.proof} href={`/api/admin/orders/${o.id}/payment-proof/${p.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/admin/orders/${o.id}/payment-proof/${p.id}`} alt="Payment screenshot from the customer" loading="lazy"/><span>{formatAdminDateTime(p.createdAt, storeTimezone)}</span></a>)}</div>
          </div>}
        </section>

        {(o.issuedGiftCards || []).length > 0 && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Gift cards from this order</h2></div>
          <div className={s.panelBody}>
            {o.issuedGiftCards.map((c: any) => <div key={c.id} className={s.line}><span>{c.code}</span><span>{c.status} · {money(c.balance, c.currency)} of {money(c.initialAmount, c.currency)}</span></div>)}
          </div>
        </section>}

        {fulfillments.length > 0 && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Parcels</h2><span className={ui.muted}>{fulfillments.length}</span></div>
          <div className={s.panelBody}>
            {fulfillments.map((f: any) => <div className={s.parcel} key={f.id}>
              <div>
                <strong>{f.status === 'DELIVERED' ? 'Delivered' : f.status === 'CANCELLED' ? 'Cancelled' : 'On its way'}</strong>{f.trackingCompany ? ` · ${f.trackingCompany}` : ''}
                <p className={ui.muted}>{f.trackingNumber ? `Tracking: ${f.trackingNumber}` : 'No tracking number'}{safeHttpUrl(f.trackingUrl) ? <> · <a className={ui.textLink} href={safeHttpUrl(f.trackingUrl) ?? undefined} target="_blank" rel="noopener noreferrer">Track</a></> : ''}</p>
                <p className={ui.muted}>{f.lines?.length || 0} item{f.lines?.length === 1 ? '' : 's'} · {f.shippedAt ? `Sent ${formatAdminDate(f.shippedAt, storeTimezone)}` : 'Not sent yet'}{f.deliveredAt ? ` · Delivered ${formatAdminDate(f.deliveredAt, storeTimezone)}` : ''}</p>
              </div>
              {f.status !== 'DELIVERED' && f.status !== 'CANCELLED' && <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => markDelivered(f.id)} disabled={markingDelivered === f.id}>{markingDelivered === f.id ? 'Saving…' : 'Mark delivered'}</button>}
            </div>)}
          </div>
        </section>}

        <DeliveryTrackingAdmin orderId={o.id} orderStatus={o.status} className={s.tracking}/>
      </div>

      <aside className={s.side}>
        {!editing && <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>Notes</h2></div>
          <div className={s.panelBody}>
            <textarea className={ui.textarea} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note for the team (only staff see it)…" aria-label="Note for the team"/>
            <button className={`${ui.btn} ${s.wide}`} onClick={addNote} disabled={addingNote || !note.trim()}><Plus size={15}/>{addingNote ? 'Adding…' : 'Add note'}</button>
            {o.notes && <div className={s.staffNote}>{o.notes}</div>}
            <div className={s.log}>
              {(o.notesHistory || []).map((n: any) => <div className={s.logItem} key={n.id}><span className={s.logDot}/><div><strong>{n.user?.name || 'Staff'}</strong><p>{n.body}</p><small className={ui.muted}>{formatAdminDateTime(n.createdAt, storeTimezone)}</small></div></div>)}
              {!o.notesHistory?.length && !o.notes && <p className={ui.muted}>No notes yet.</p>}
            </div>
          </div>
        </section>}
        <section className={s.panel}>
          <div className={s.panelHead}><h2 className={s.panelTitle}>History</h2></div>
          <div className={s.panelBody}>
            <div className={s.log}>
              {(o.events || []).map((e: any) => <div className={s.logItem} key={e.id}><span className={s.logDot}/><div><strong>{statusInfo(e.status).label}</strong><p className={ui.muted}>{e.message || 'Order updated'}</p><small className={ui.muted}>{formatAdminDateTime(e.createdAt, storeTimezone)}</small></div></div>)}
              {!o.events?.length && <p className={ui.muted}>Nothing yet.</p>}
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
}
