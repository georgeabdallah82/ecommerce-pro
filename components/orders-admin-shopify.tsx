'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, FileText, MessageCircle, MoreHorizontal, PackageCheck, Phone, Plus, RefreshCw, Search, Send, ShoppingCart, Truck, X, XCircle } from 'lucide-react'
import { money } from '@/lib/config'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { canTransitionOrder } from '@/lib/orders'
import { whatsappConfirmLink } from '@/lib/whatsapp-confirm'
import { ORDER_VIEWS, customerCity, customerName, customerPhone, driverShareLink, itemsSummary, nextStep, paymentInfo, statusInfo, telLink, viewCount, type OrderViewId } from '@/lib/order-flow'
import { useConfirm } from './admin-confirm'
import AdminMenu from './admin-menu'
import { runReauthed, useReauth } from './admin-reauth'
import { useModalFocus } from './use-modal-focus'
import styles from './admin-orders-board.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

// Admin > Orders. Each order is a card that says, in plain words, where it is ("New", "Out for
// delivery"), what it is waiting for, and has one button for that next step. Everything else
// (invoice, tracking, refund, cancel) is in the order's "More" menu, with words, not icons.

type Order = any
type Modal = { type: 'refund' | 'tracking'; order: Order } | null
type Initial = { rows: Order[]; total: number; page: number; pageSize: number; pages: number; counts?: Record<string, number> }

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    // `code` tells the screen when the server wants the person to confirm it is them (REAUTH_REQUIRED).
    const error = new Error(data.error || 'Request failed') as Error & { code?: string }
    error.code = data.code
    throw error
  }
  return data
}

const TONE: Record<string, string> = { warning: styles.toneWarning, info: styles.toneInfo, success: styles.toneSuccess, danger: styles.toneDanger, neutral: styles.toneNeutral }

// The "More" menus (components/admin-menu.tsx: keyboard, focus and Escape). A count sits on the button's corner,
// outside its name; `label` says what it counts.
function MoreMenu({ label, children, badge = 0, down = false }: { label: string; children: React.ReactNode; badge?: number; down?: boolean }) {
  return <AdminMenu className={styles.more} buttonClassName={`${ui.btn} ${ui.btnSecondary} ${styles.actionBtn}`} menuClassName={`${styles.menu}${down ? ` ${styles.menuDown}` : ''}`} label={label}
    content={<><MoreHorizontal size={16} aria-hidden="true" /> More <ChevronDown size={14} aria-hidden="true" /></>}
    badge={badge ? <span className={`${styles.menuBadge} ${styles.menuBadgeCorner}`} aria-hidden="true">{badge}</span> : null}>{children}</AdminMenu>
}

export function OrdersAdminShopify({ initial, canRefund = false, storeTimezone, storeName = '', storeCountry = 'Lebanon', unfinishedCount = 0 }: { initial: Initial; canRefund?: boolean; storeTimezone?: string; storeName?: string; storeCountry?: string; unfinishedCount?: number }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState<Order[]>(initial?.rows || [])
  const [counts, setCounts] = useState<Record<string, number>>(initial?.counts || {})
  const [total, setTotal] = useState(Number(initial?.total ?? initial?.rows?.length ?? 0))
  const [page, setPage] = useState(Number(initial?.page || 1))
  const [pageSize, setPageSize] = useState(Number(initial?.pageSize || 50))
  const [pages, setPages] = useState(Number(initial?.pages || 1))
  const [q, setQ] = useState('')
  const [view, setView] = useState<OrderViewId>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [modal, setModal] = useState<Modal>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingCompany, setTrackingCompany] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // The refund and tracking dialog: modal (focus in, Tab kept inside, Escape closes, focus back), and why a save
  // failed shows inside it. It showed on the page behind the dark overlay, where nobody could see it.
  const [modalError, setModalError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const modalTitle = useId()
  const closeModal = () => { setModal(null); setModalError('') }
  useModalFocus(modalRef, !!modal, () => { if (!busy) closeModal() })

  const viewStatuses = (ORDER_VIEWS.find(v => v.id === view)?.statuses || []) as readonly string[]
  const allSelected = rows.length > 0 && rows.every(o => selected.includes(o.id))

  async function load(nextPage = 1, keepMessages = false) {
    setLoading(true)
    if (!keepMessages) { setError(''); setNotice('') }
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(pageSize), counts: '1' })
      if (q.trim()) params.set('q', q.trim())
      if (viewStatuses.length) params.set('status', viewStatuses.join(','))
      const data = await api(`/api/admin/orders?${params.toString()}`)
      setRows(Array.isArray(data) ? data : data.rows || [])
      if (data.counts) setCounts(data.counts)
      setTotal(Number(data.pagination?.total ?? data.rows?.length ?? 0))
      setPages(Number(data.pagination?.pages ?? 1))
      setPage(Number(data.pagination?.page ?? nextPage))
      setSelected([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load orders')
    } finally {
      setLoading(false)
    }
  }

  // Search (after a short pause), the view and the page size reload the list as they change.
  // The first render already has the server's rows.
  const applied = useRef(JSON.stringify([q.trim(), view, pageSize]))
  useEffect(() => {
    const key = JSON.stringify([q.trim(), view, pageSize])
    if (key === applied.current) return
    const timer = setTimeout(() => { applied.current = key; void load(1) }, q.trim() ? 300 : 0)
    return () => clearTimeout(timer)
  }, [q, view, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  async function update(order: Order, data: Record<string, unknown>, message: string) {
    setBusy(order.id); setError(''); setNotice('')
    try {
      const response = await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id: order.id, ...data }) })
      await load(page, true)
      setNotice(message)
      return response
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update order')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function advance(order: Order) {
    const step = nextStep(order, money)
    if (!step) return
    if (!(await confirm({ title: step.confirmTitle, message: step.confirmMessage, confirmLabel: step.label, tone: 'default' }))) return
    await update(order, { status: step.to }, `#${order.orderNumber} is now ${statusInfo(step.to).label.toLowerCase()}.`)
  }

  async function cancelOrder(order: Order) {
    const paid = order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED'
    const ok = await confirm({
      title: `Cancel #${order.orderNumber}?`,
      message: `${money(order.grandTotal, order.currency)} · ${customerName(order)}. Reserved stock goes back on sale${order.status === 'SHIPPED' ? ' (a returned parcel goes back in stock)' : ''}.${paid ? ' The paid amount is refunded.' : ''} This can't be undone.`,
      confirmLabel: 'Cancel order',
    })
    if (!ok) return
    const response = await update(order, { status: 'CANCELLED' }, `#${order.orderNumber} was cancelled.`)
    if (response?.cancelRefund) {
      const amount = money(response.cancelRefund.amount, order.currency)
      setNotice(response.cancelRefund.pending ? `#${order.orderNumber} was cancelled. A ${amount} refund is being processed.` : `#${order.orderNumber} was cancelled and ${amount} refunded.`)
    }
  }

  async function bulkStatus(status: 'PROCESSING' | 'SHIPPED' | 'CANCELLED') {
    if (!selected.length) return
    const eligible = rows.filter(o => selected.includes(o.id) && o.status !== status && canTransitionOrder(o.status, status)).map(o => o.id)
    const words = status === 'CANCELLED' ? 'cancelled' : status === 'SHIPPED' ? 'sent out for delivery' : 'moved to Preparing'
    if (!eligible.length) { setError(`None of the selected orders can be ${words} from where they are now.`); return }
    const ok = await confirm({
      title: `${eligible.length} order${eligible.length === 1 ? '' : 's'} will be ${words}`,
      message: `${selected.length - eligible.length ? `${selected.length - eligible.length} selected order${selected.length - eligible.length === 1 ? '' : 's'} can't be ${words} and will be left as they are. ` : ''}${status === 'SHIPPED' ? 'Each customer gets an email that the order is on its way. ' : ''}This can't be undone.`,
      confirmLabel: status === 'CANCELLED' ? 'Cancel orders' : 'Continue',
      tone: status === 'CANCELLED' ? 'danger' : 'default',
    })
    if (!ok) return
    setBusy('bulk'); setError(''); setNotice('')
    try {
      // A few at a time; each order is still checked and updated on its own.
      const queue = [...eligible]
      const failures: string[] = []
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          try { await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) }) } catch (e) { failures.push(e instanceof Error ? e.message : 'Unable to update order') }
        }
      }))
      await load(page, true)
      const done = eligible.length - failures.length
      if (failures.length) setError(`${failures.length} order${failures.length === 1 ? '' : 's'} could not be updated: ${failures[0]}`)
      if (done) setNotice(`${done} order${done === 1 ? '' : 's'} ${words}.`)
    } finally {
      setBusy(null)
    }
  }

  const askForConfirmation = useReauth()
  async function refundOrder() {
    if (!modal || modal.type !== 'refund') return
    const amount = Math.round(Number(refundAmount) * 100)
    const alreadyRefunded = Number(modal.order.refundedTotal || modal.order.refundedAmount || 0)
    const max = Math.max(0, Number(modal.order.grandTotal || 0) - alreadyRefunded)
    if (!Number.isInteger(amount) || amount <= 0 || amount > max) { setModalError(`Refund must be between 0.01 and ${money(max, modal.order.currency)}`); return }
    setBusy(modal.order.id); setModalError(''); setError(''); setNotice('')
    try {
      await runReauthed(askForConfirmation, () => api('/api/admin/refunds', { method: 'POST', body: JSON.stringify({ orderId: modal.order.id, amount, reason: 'Admin refund' }) }))
      await load(page, true)
      closeModal(); setRefundAmount(''); setNotice('Refund issued.')
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Unable to refund order')
    } finally {
      setBusy(null)
    }
  }
  // Stays open when the save fails, with what was typed and why.
  async function saveTracking() {
    if (!modal || modal.type !== 'tracking') return
    setBusy(modal.order.id); setModalError(''); setError(''); setNotice('')
    try {
      await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id: modal.order.id, trackingNumber: trackingNumber.trim(), trackingCompany: trackingCompany.trim() || null }) })
      await load(page, true)
      closeModal(); setNotice('Tracking number saved.')
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Unable to save the tracking number')
    } finally {
      setBusy(null)
    }
  }

  const toConfirm = counts.PENDING || 0

  // The quick-view row scrolls sideways on a phone; the fade on its right edge shows only while
  // more views are hidden past that edge.
  const viewsRef = useRef<HTMLElement>(null)
  const [viewsMore, setViewsMore] = useState(false)
  const checkViews = useCallback(() => {
    const el = viewsRef.current
    if (el) setViewsMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])
  useEffect(() => {
    checkViews()
    window.addEventListener('resize', checkViews)
    return () => window.removeEventListener('resize', checkViews)
  }, [checkViews, counts])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Orders</h1>
          <p className={styles.subtitle}>{toConfirm ? <><strong>{toConfirm} new order{toConfirm === 1 ? '' : 's'}</strong> to confirm with the customer.</> : 'No new orders waiting to be confirmed.'}</p>
        </div>
        <div className={styles.headerActions}>
          <MoreMenu label={`More order pages${unfinishedCount ? `, ${unfinishedCount} unfinished checkout${unfinishedCount === 1 ? '' : 's'} to follow up` : ''}`} down badge={unfinishedCount}>
            <Link role="menuitem" href="/admin/orders/deliveries"><Truck size={15} aria-hidden="true" /> Delivery sheet</Link>
            <Link role="menuitem" href="/admin/orders/unfinished"><ShoppingCart size={15} aria-hidden="true" /> Unfinished checkouts{unfinishedCount ? <span className={styles.menuCount}>{unfinishedCount}</span> : null}</Link>
          </MoreMenu>
          <Link className={ui.btn} href="/admin/orders/new"><Plus size={15} /> Create order</Link>
        </div>
      </div>

      <div className={`${styles.viewsWrap}${viewsMore ? ` ${styles.viewsMore}` : ''}`}>
        <nav ref={viewsRef} className={styles.views} aria-label="Order views" onScroll={checkViews}>
          {ORDER_VIEWS.map(v => {
            const n = viewCount(counts, v)
            return (
              <button key={v.id} type="button" className={`${styles.view}${view === v.id ? ` ${styles.viewActive}` : ''}${v.id === 'action' && n ? ` ${styles.viewAlert}` : ''}`} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
                {v.label}<span>{n}</span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className={styles.search}>
        <Search size={16} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by order number, name, phone, city or email" aria-label="Search orders" />
        {q && <button onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button>}
      </div>

      {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role="status">{error || notice}</div>}

      {selected.length > 0 && (
        <div className={styles.bulkBar}>
          <strong>{selected.length} selected</strong>
          <div className={styles.bulkActions}>
            <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} disabled={busy === 'bulk'} onClick={() => bulkStatus('PROCESSING')}>Start preparing</button>
            <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} disabled={busy === 'bulk'} onClick={() => bulkStatus('SHIPPED')}>Send out for delivery</button>
            <button className={`${ui.btn} ${ui.btnDanger} ${ui.btnSmall}`} disabled={busy === 'bulk'} onClick={() => bulkStatus('CANCELLED')}>Cancel</button>
            <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>
      )}

      <div className={styles.listHead}>
        <label className={styles.selectAll}><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map(o => o.id))} /> Select all</label>
        <span className={styles.listMeta}>
          {loading ? 'Loading…' : `${total.toLocaleString()} order${total === 1 ? '' : 's'}`}
          <button type="button" className={ui.iconBtn} aria-label="Refresh orders" title="Refresh" onClick={() => load(page)} disabled={loading || busy !== null}><RefreshCw size={15} /></button>
        </span>
      </div>

      <div className={styles.list}>
        {rows.map(o => {
          const status = statusInfo(o.status)
          const payment = paymentInfo(o)
          const step = nextStep(o, money)
          const phone = customerPhone(o)
          const tel = telLink(o, storeCountry)
          const city = customerCity(o)
          const wa = o.status === 'PENDING' ? whatsappConfirmLink(o, storeName, storeCountry, money) : ''
          const open = !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)
          const isSelected = selected.includes(o.id)
          const working = busy === o.id
          return (
            <article key={o.id} className={`${styles.card}${isSelected ? ` ${styles.cardSelected}` : ''}`}>
              <div className={styles.cardTop}>
                <input type="checkbox" aria-label={`Select order ${o.orderNumber}`} checked={isSelected} onChange={() => setSelected(current => current.includes(o.id) ? current.filter(id => id !== o.id) : [...current, o.id])} />
                <Link className={styles.orderLink} href={`/admin/orders/${o.id}`}>
                  <strong>#{o.orderNumber}</strong>
                  <span>{formatAdminDateTime(o.createdAt, storeTimezone)}</span>
                </Link>
                <span className={`${styles.pill} ${TONE[status.tone]}`}>{status.label}</span>
              </div>
              <Link className={styles.cardBody} href={`/admin/orders/${o.id}`} tabIndex={-1}>
                <div className={styles.who}><strong>{customerName(o)}</strong>{phone ? <span>{phone}</span> : null}{city ? <span>{city}</span> : null}</div>
                {o.risk ? <div className={`${styles.risk}${o.risk.level === 'high' ? ` ${styles.riskHigh}` : ''}`}><AlertTriangle size={14} aria-hidden="true" /> <span>{o.risk.level === 'high' ? 'Call first' : 'Check'}: {o.risk.reasons.join(' · ').toLowerCase()}</span></div> : null}
                <div className={styles.what}>{itemsSummary(o)}</div>
                <div className={styles.money}><strong>{money(o.grandTotal, o.currency)}</strong><span className={`${styles.payment} ${TONE[payment.tone]}`}>{payment.label}</span></div>
                {o.trackingNumber ? <div className={styles.meta}>Tracking: {o.trackingNumber}</div> : null}
                {open && status.hint ? <div className={styles.hint}>Next: {status.hint}</div> : null}
              </Link>
              <div className={styles.actions}>
                {step && <button type="button" className={`${ui.btn} ${styles.actionBtn} ${styles.primaryAction}`} disabled={working} onClick={() => advance(o)}>{working ? 'Saving…' : step.label}</button>}
                {wa && <a className={`${ui.btn} ${styles.actionBtn} ${styles.whatsapp}`} href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
                {!step && <Link className={`${ui.btn} ${ui.btnSecondary} ${styles.actionBtn}`} href={`/admin/orders/${o.id}`}>View order</Link>}
                <MoreMenu label={`More actions for order ${o.orderNumber}`}>
                  <Link role="menuitem" href={`/admin/orders/${o.id}`}><PackageCheck size={15} /> Open order</Link>
                  {tel && <a role="menuitem" href={tel}><Phone size={15} /> Call customer</a>}
                  {open && <a role="menuitem" href={driverShareLink(o, storeName, money)} target="_blank" rel="noreferrer"><Send size={15} /> Send to driver (WhatsApp)</a>}
                  <Link role="menuitem" href={`/admin/orders/${o.id}/invoice`}><FileText size={15} /> Invoice / print</Link>
                  {open && <button role="menuitem" type="button" onClick={() => { setTrackingNumber(o.trackingNumber || ''); setTrackingCompany(o.trackingCompany || ''); setModalError(''); setModal({ type: 'tracking', order: o }) }}><Truck size={15} /> Tracking number</button>}
                  {/* Only when something paid is left to give back (an order paid in full with a gift card or a 100% discount has nothing). */}
                  {canRefund && ['PAID', 'PARTIALLY_REFUNDED'].includes(o.paymentStatus) && o.status !== 'CANCELLED' && Number(o.grandTotal || 0) - Number(o.refundedTotal || o.refundedAmount || 0) > 0 && <button role="menuitem" type="button" onClick={() => { setRefundAmount(''); setModalError(''); setModal({ type: 'refund', order: o }) }}><RefreshCw size={15} /> Refund</button>}
                  {canTransitionOrder(o.status, 'CANCELLED') && o.status !== 'CANCELLED' && <button role="menuitem" type="button" className={styles.danger} onClick={() => cancelOrder(o)}><XCircle size={15} /> Cancel order</button>}
                </MoreMenu>
              </div>
            </article>
          )
        })}
        {!rows.length && !loading && <div className={ui.empty}><PackageCheck size={28} aria-hidden="true" /><h2 className={styles.emptyTitle}>No orders here</h2><p className={ui.muted}>{q ? 'Nothing matches that search.' : 'Try another view.'}</p></div>}
      </div>

      <div className={styles.pagination}>
        <span className={ui.muted}>Page {page} of {pages}</span>
        <div className={styles.pager}>
          <label className={styles.perPage}>Per page
            <select className={ui.select} value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button className={ui.iconBtn} aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16} /></button>
          <button className={ui.iconBtn} aria-label="Next page" disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>

      {modal && (
        <div className={ui.modalOverlay} onClick={() => { if (!busy) closeModal() }}>
          <div ref={modalRef} className={`${ui.card} ${styles.modal}`} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={modalTitle} tabIndex={-1}>
            <div className={styles.modalHead}>
              <div>
                <span className={ui.muted}>Order #{modal.order.orderNumber}</span>
                <h2 id={modalTitle}>{modal.type === 'refund' ? 'Refund' : 'Tracking number'}</h2>
                <p className={ui.muted}>{modal.type === 'refund' ? 'The refund is recorded on the order; it can never be more than was paid.' : 'The customer can follow the parcel with it. Changing it after the order went out tells the customer.'}</p>
              </div>
              <button className={ui.iconBtn} onClick={closeModal} disabled={!!busy} aria-label="Close"><X size={17} aria-hidden="true" /></button>
            </div>
            {modal.type === 'refund' && <>
              <label className={ui.fieldLabel}>Amount to refund
                <input className={ui.input} data-autofocus type="number" min="0.01" step="0.01" value={refundAmount} onChange={e => { setRefundAmount(e.target.value); setModalError('') }} placeholder={money(modal.order.grandTotal, modal.order.currency)} />
              </label>
              <p className={ui.muted}>At most <strong>{money(Math.max(0, Number(modal.order.grandTotal || 0) - Number(modal.order.refundedTotal || modal.order.refundedAmount || 0)), modal.order.currency)}</strong></p>
              {modalError && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{modalError}</div>}
              <div className={styles.modalFooter}>
                <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={closeModal} disabled={!!busy}>Close</button>
                <button className={ui.btn} onClick={refundOrder} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Refunding…' : 'Refund'}</button>
              </div>
            </>}
            {modal.type === 'tracking' && <>
              <label className={ui.fieldLabel}>Tracking number<input className={ui.input} data-autofocus maxLength={120} value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="From the delivery company" /></label>
              <label className={ui.fieldLabel}>Delivery company<input className={ui.input} maxLength={120} value={trackingCompany} onChange={e => setTrackingCompany(e.target.value)} placeholder="Aramex, DHL, LibanPost…" /></label>
              {modalError && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{modalError}</div>}
              <div className={styles.modalFooter}>
                <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={closeModal} disabled={!!busy}>Close</button>
                <button className={ui.btn} onClick={saveTracking} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Saving…' : 'Save'}</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}
