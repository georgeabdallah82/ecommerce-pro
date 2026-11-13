'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, Copy, MessageCircle, Pencil, Printer, X } from 'lucide-react'
import OrderInvoice from './order-invoice'
import { useI18n } from '@/components/lang-provider'
import { internationalPhone } from '@/lib/phone'
import { customerName, customerPhone } from '@/lib/order-flow'
import type { InvoiceOrder, InvoiceStore } from '@/lib/invoice-template'
import s from './invoice-workspace.module.css'

// The invoice screen: the invoice itself, and above it what can be done with it. Staff (inside the
// admin) can print or save it as a PDF, send the customer a link on WhatsApp, add a one-off note,
// and edit the texts every invoice shows. Customers (/invoice/<id>) only get "Print / Save PDF",
// and their copy is in the language of the store they shop in; the admin's stays English.
//
// Printing: a second copy of the invoice is placed directly in <body>, and while printing
// everything else on the page is hidden, so the paper shows the invoice alone (no admin menus,
// no store header), however the page around it is built.

type Props = {
  order: InvoiceOrder
  store: InvoiceStore
  timezone?: string
  mode: 'admin' | 'customer'
  customerLink?: string
  storeCountry?: string
  canEditTemplate?: boolean
}

export default function InvoiceWorkspace({ order, store, timezone, mode, customerLink = '', storeCountry = 'Lebanon', canEditTemplate = false }: Props) {
  const router = useRouter()
  const { t, lang } = useI18n()
  const customer = mode === 'customer'
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [texts, setTexts] = useState({ title: store.title, notes: store.notes, footer: store.footer })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setTexts({ title: store.title, notes: store.notes, footer: store.footer }) }, [store.title, store.notes, store.footer])
  const shown = { ...store, ...texts }

  const [printHost, setPrintHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const host = document.createElement('div')
    host.className = s.printHost
    document.body.appendChild(host)
    setPrintHost(host)
    return () => { host.remove() }
  }, [])

  const whatsapp = useMemo(() => {
    const digits = internationalPhone(customerPhone(order), storeCountry)
    if (!digits || !customerLink) return ''
    const first = customerName({ ...order, user: order.userName ? { name: order.userName } : null }).split(' ')[0]
    const text = `Hello ${first}, here is your invoice for order #${order.orderNumber} from ${store.name}:\n${customerLink}`
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
  }, [order, store.name, customerLink, storeCountry])

  async function copyLink() {
    try { await navigator.clipboard.writeText(customerLink); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { window.prompt('Copy this link:', customerLink) }
  }

  async function saveTexts() {
    setSaving(true); setMessage('')
    try {
      const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { 'invoice.title': texts.title.trim().slice(0, 40), 'invoice.notes': texts.notes.trim().slice(0, 1500), 'invoice.footer': texts.footer.trim().slice(0, 300) } }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setEditing(false); setMessage('Saved. Every invoice now uses these texts.')
      router.refresh()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save') }
    finally { setSaving(false) }
  }

  const invoice = <OrderInvoice order={order} store={shown} note={note} timezone={timezone} t={customer ? t : undefined} lang={customer ? lang : 'en'}/>

  return (
    <div className={`${s.page} ${mode === 'customer' ? s.customerPage : ''}`}>
      <div className={s.toolbar}>
        {mode === 'admin' && <Link className={s.back} href={`/admin/orders/${order.id}`}><ArrowLeft size={16}/> Order #{order.orderNumber}</Link>}
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => window.print()}><Printer size={17} aria-hidden="true"/> {t('Print / Save PDF')}</button>
          {mode === 'admin' && whatsapp && <a className={`${s.btn} ${s.whatsapp}`} href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={17}/> Send on WhatsApp</a>}
          {mode === 'admin' && customerLink && <button type="button" className={s.btn} onClick={copyLink}>{copied ? <><Check size={16}/> Link copied</> : <><Copy size={16}/> Copy customer link</>}</button>}
          {mode === 'admin' && canEditTemplate && <button type="button" className={s.btn} aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? <><X size={16}/> Close</> : <><Pencil size={16}/> Edit invoice</>}</button>}
        </div>
        {customer && <p className={s.hint}>{t('To keep a copy, tap “Print / Save PDF” and choose “Save as PDF”.')}</p>}
      </div>

      {message && <p className={s.message} role="status">{message}</p>}

      {editing && <section className={s.editor} aria-label="Edit invoice">
        <h2>Texts on every invoice</h2>
        <p className={s.small}>The preview below changes as you type. Save to use them on all invoices.</p>
        <label><span>Title</span><input value={texts.title} maxLength={40} onChange={e => setTexts({ ...texts, title: e.target.value })} placeholder="Invoice"/></label>
        <label><span>Notes <i>(payment details, returns, anything for every customer)</i></span><textarea rows={3} value={texts.notes} maxLength={1500} onChange={e => setTexts({ ...texts, notes: e.target.value })} placeholder="Whish / OMT: 70 123 456 · Exchanges within 7 days with the receipt"/></label>
        <label><span>Thank-you line at the bottom</span><input value={texts.footer} maxLength={300} onChange={e => setTexts({ ...texts, footer: e.target.value })} placeholder="Thank you for shopping with us!"/></label>
        <p className={s.small}>Store name, logo and colour come from the <Link href="/admin/online-store/theme-editor">theme editor</Link>. Address, phone and email come from <Link href="/admin/settings">Settings</Link>.</p>
        <div className={s.editorActions}>
          <button type="button" className={s.btn} onClick={() => { setTexts({ title: store.title, notes: store.notes, footer: store.footer }); setEditing(false) }}>Cancel</button>
          <button type="button" className={`${s.btn} ${s.primary}`} disabled={saving} onClick={saveTexts}>{saving ? 'Saving…' : 'Save for all invoices'}</button>
        </div>
      </section>}

      {mode === 'admin' && <label className={s.noteField}><span>Note on this invoice only <i>(printed, not saved)</i></span><textarea rows={2} value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Paid 20$ in advance on Whish"/></label>}

      <div className={s.paper}>{invoice}</div>
      {printHost && createPortal(invoice, printHost)}
    </div>
  )
}
