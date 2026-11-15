'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Copy, Download, Link2, MousePointerClick } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-product-import.module.css'
import { markedUpPrice, normalizeImport, type ImportedProduct } from '@/lib/product-import'
import { fetchRead } from '@/lib/retry-fetch'

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed'), { data: d })
  return d
}
const remembered = (key: string, fallback: string) => { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} }
const num = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0 }

export default function ProductImportAdmin({ bookmarklet, storeName, currency, embedded = false }: { bookmarklet: string; storeName: string; currency: string; embedded?: boolean }) {
  const router = useRouter()
  const [product, setProduct] = useState<ImportedProduct | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'' | 'fetch' | 'create'>('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const dragRef = useRef<HTMLAnchorElement>(null)

  // Review fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [cost, setCost] = useState('')
  const [fees, setFees] = useState('0')
  const [markup, setMarkup] = useState('2.5')
  const [price, setPrice] = useState('')
  const [priceEdited, setPriceEdited] = useState(false)
  const [quantity, setQuantity] = useState('')

  // React won't render a javascript: link, so the draggable bookmark gets its address directly.
  useEffect(() => { dragRef.current?.setAttribute('href', bookmarklet) }, [bookmarklet])
  useEffect(() => { setMarkup(remembered('import.markup', '2.5')); setFees(remembered('import.fees', '0')) }, [])

  // Arriving from the browser button: the product travels in the address after "#import=".
  useEffect(() => {
    const m = window.location.hash.match(/^#import=(.+)$/)
    if (!m) return
    try { load(normalizeImport(JSON.parse(decodeURIComponent(m[1])))) } catch { setError("That import didn't come through complete. Tap the button on the product page again.") }
    history.replaceState(null, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function load(p: ImportedProduct) {
    setProduct(p); setTitle(p.title); setDescription(p.description); setChosen(p.images.slice(0, 10))
    setCost(p.price !== null && (!p.currency || p.currency === currency) ? String(p.price) : '')
    setPriceEdited(false); setError('')
  }

  const autoPrice = useMemo(() => markedUpPrice(num(cost) + num(fees), num(markup)), [cost, fees, markup])
  useEffect(() => { if (!priceEdited) setPrice(autoPrice ? (autoPrice / 100).toFixed(2) : '') }, [autoPrice, priceEdited])

  async function fetchLink() {
    setBusy('fetch'); setError('')
    try { const d = await api('/api/admin/products/import', { method: 'POST', body: JSON.stringify({ action: 'fetch', url }) }); load(d.product) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read that link') }
    finally { setBusy('') }
  }

  async function create() {
    if (!product) return
    setBusy('create'); setError('')
    remember('import.markup', markup); remember('import.fees', fees)
    try {
      const costCents = cost.trim() ? Math.round((num(cost) + num(fees)) * 100) : null
      const d = await api('/api/admin/products/import', { method: 'POST', body: JSON.stringify({
        action: 'create', product: { ...product, title, description }, images: chosen,
        priceCents: Math.round(num(price) * 100), costCents, quantity: quantity.trim() === '' ? null : Math.max(0, Math.trunc(num(quantity))),
      }) })
      router.push(`/admin/products/${d.id}${d.failedImages ? `?importNote=${d.failedImages}` : ''}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the product'); setBusy('') }
  }

  const copy = async () => { try { await navigator.clipboard.writeText(bookmarklet); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }
  const toggle = (img: string) => setChosen(c => c.includes(img) ? c.filter(x => x !== img) : c.length >= 10 ? c : [...c, img])
  const foreign = product?.currency && product.currency !== currency

  return <div className={s.page}>
    {!embedded && <div className={ui.sectionHead}>
      <div>
        <Link className={ui.textLink} href="/admin/products"><ArrowLeft size={15} /> Back to products</Link>
        <span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>CATALOG</span>
        <h1 className={ui.title}>Import a product</h1>
        <p className={ui.muted}>Bring a product in from AliExpress, Shein, Alibaba or another shop. It's saved as a draft so you can check it before it goes live.</p>
      </div>
    </div>}
    {embedded && <p className={ui.muted}>Bring one product in from AliExpress, Shein, Alibaba or another shop. It's saved as a draft so you can check it before it goes live.</p>}
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    {!product && <>
      <section className={`${ui.card} ${s.card}`}>
        <h3><MousePointerClick size={17} /> Import button for your browser <span className={s.badge}>Best for AliExpress, Shein, Alibaba</span></h3>
        <p className={ui.muted}>Save this button once. Then open any product page and tap it — the product opens here, ready to review.</p>
        <div className={s.btnRow}>
          <a ref={dragRef} className={`${ui.btn} ${s.bookmarklet}`} href="#" onClick={e => { e.preventDefault(); setError('Drag this button to your bookmarks bar instead of clicking it here.') }} draggable>Import to {storeName || 'store'}</a>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={copy}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy button code</>}</button>
        </div>
        <details className={s.howto}><summary>On a computer</summary><ol><li>Show your bookmarks bar (Ctrl+Shift+B, or ⌘+Shift+B on Mac).</li><li>Drag the red “Import to {storeName || 'store'}” button onto the bar.</li><li>Open a product on AliExpress, Shein or Alibaba, wait for its photos, and click the bookmark.</li></ol></details>
        <details className={s.howto}><summary>On a phone</summary><ol><li>Tap <strong>Copy button code</strong> above.</li><li>Bookmark any page (for example this one), then edit that bookmark: name it <strong>Import</strong> and replace its address with the copied code. Save.</li><li>Open the product page in your browser (not the AliExpress or Shein app). <strong>Chrome:</strong> tap the address bar, type <em>Import</em> and pick the bookmark. <strong>Safari:</strong> open Bookmarks and tap it.</li></ol></details>
      </section>

      <section className={`${ui.card} ${s.card}`}>
        <h3><Link2 size={17} /> Or paste a link</h3>
        <p className={ui.muted}>Works for shops that allow it. AliExpress, Shein and Alibaba block this, so use the button above for them.</p>
        <div className={s.btnRow}>
          <input className={ui.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
          <button type="button" className={ui.btn} disabled={!url.trim() || busy === 'fetch'} onClick={fetchLink}><Download size={15} /> {busy === 'fetch' ? 'Reading…' : 'Import'}</button>
        </div>
      </section>
    </>}

    {product && <section className={`${ui.card} ${s.card}`}>
      <h3>Review before saving</h3>
      <label className={ui.fieldLabel}>Product name<input className={ui.input} value={title} onChange={e => setTitle(e.target.value)} /></label>

      <div className={ui.fieldLabel}>Photos <span className={ui.muted}>({chosen.length} of {product.images.length} selected, up to 10 — tap to add or remove)</span></div>
      <div className={s.photos}>{product.images.map(img => <button type="button" key={img} className={chosen.includes(img) ? `${s.photo} ${s.photoOn}` : s.photo} onClick={() => toggle(img)}><img src={img} alt="" referrerPolicy="no-referrer" />{chosen.includes(img) && <span className={s.tick}><Check size={13} /></span>}</button>)}</div>

      <div className={s.priceGrid}>
        <label className={ui.fieldLabel}>Supplier price ({currency})<input className={ui.input} value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="0.00" /></label>
        <label className={ui.fieldLabel}>Shipping & fees per item<input className={ui.input} value={fees} onChange={e => setFees(e.target.value)} inputMode="decimal" /></label>
        <label className={ui.fieldLabel}>Markup (×)<input className={ui.input} value={markup} onChange={e => { setMarkup(e.target.value); setPriceEdited(false) }} inputMode="decimal" /></label>
        <label className={ui.fieldLabel}>Your selling price ({currency})<input className={ui.input} value={price} onChange={e => { setPrice(e.target.value); setPriceEdited(true) }} inputMode="decimal" /></label>
      </div>
      {foreign && <p className={s.warn}>The supplier showed this price in {product.currency} ({product.price}). Enter what it costs you in {currency}.</p>}
      {num(price) > 0 && cost.trim() !== '' && <p className={ui.muted}>Profit per item: <strong>{(num(price) - num(cost) - num(fees)).toFixed(2)} {currency}</strong></p>}

      <label className={ui.fieldLabel}>How many do you have? <span className={ui.muted}>(optional — leave empty if you don't count stock)</span><input className={ui.input} value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="numeric" /></label>
      {product.options.length > 0 && <div className={ui.muted}>{product.options.map((o, i) => <p key={o.name}><strong>{o.name}:</strong> {o.values.join(', ')}{i === 0 ? ' — added as options customers can pick' : ' — listed in the description'}</p>)}</div>}
      <label className={ui.fieldLabel}>Description<textarea className={ui.textarea} rows={8} value={description} onChange={e => setDescription(e.target.value)} /></label>

      <div className={s.btnRow}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setProduct(null); setError('') }}>Start over</button>
        <button type="button" className={ui.btn} disabled={busy === 'create' || !title.trim()} onClick={create}>{busy === 'create' ? 'Saving photos…' : 'Create draft product'}</button>
      </div>
      <p className={ui.muted}>Photos are copied into your Files. The product is saved as a draft — publish it from the product page when it's ready.</p>
    </section>}
  </div>
}
