'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Camera, CameraOff, Check, Minus, Plus, ScanBarcode } from 'lucide-react'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

type Found = { code: string; productId: string; name: string; variant: string; sku: string; image: string; items: Array<{ id: string; location: string; quantity: number; reserved: number }> }
type Counted = { key: string; name: string; location: string; before: number; after: number }

// Chrome on Android reads barcodes itself (BarcodeDetector). Other browsers can still type the
// code or use a Bluetooth/USB scanner, which types it and presses Enter.
type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
const detectorSupported = () => typeof window !== 'undefined' && 'BarcodeDetector' in window

// Inventory > Stock count (app/admin/inventory/count).
export default function StockCount({ canManage }: { canManage: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [supported, setSupported] = useState(true)
  const [code, setCode] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Counted[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { setSupported(detectorSupported()) }, [])
  useEffect(() => () => stopCamera(), [])

  function stopCamera() {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach(t => t.stop())
    stream.current = null
    setCameraOn(false)
  }

  async function startCamera() {
    setError(''); setNotice('')
    if (!detectorSupported()) { setSupported(false); return }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      stream.current = media
      if (video.current) { video.current.srcObject = media; await video.current.play().catch(() => {}) }
      setCameraOn(true)
      const Ctor = (window as unknown as { BarcodeDetector: new (o?: { formats?: string[] }) => Detector }).BarcodeDetector
      const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
      let reading = false
      timer.current = window.setInterval(async () => {
        if (reading || !video.current || video.current.readyState < 2) return
        reading = true
        try {
          const codes = await detector.detect(video.current)
          const value = codes[0]?.rawValue?.trim()
          if (value) { stopCamera(); setCode(value); await lookup(value) }
        } catch {} finally { reading = false }
      }, 350)
    } catch {
      setError('The camera could not start. Allow the camera for this site in your browser, or type the code below.')
      stopCamera()
    }
  }

  async function lookup(value: string) {
    setBusy(true); setError(''); setNotice(''); setFound(null)
    try {
      const r = await fetchRead(`/api/admin/inventory/lookup?code=${encodeURIComponent(value)}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Not found')
      setFound(d)
      setCounts(Object.fromEntries((d.items as Found['items']).map(i => [i.id, String(i.quantity)])))
    } catch (e) { setError(e instanceof Error ? e.message : 'Not found') }
    finally { setBusy(false) }
  }

  async function save() {
    if (!found) return
    setBusy(true); setError(''); setNotice('')
    try {
      const changed: Counted[] = []
      for (const item of found.items) {
        const after = Math.max(0, Math.floor(Number(counts[item.id])))
        if (!Number.isFinite(after) || after === item.quantity) continue
        if (after < item.reserved) throw new Error(`${item.location}: ${item.reserved} are held for open orders, so the count can't be lower than that.`)
        const r = await fetch('/api/admin/inventory', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, delta: after - item.quantity, reason: 'Stock count' }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Unable to save the count')
        changed.push({ key: `${item.id}-${Date.now()}`, name: `${found.name}${found.variant ? ` (${found.variant})` : ''}`, location: item.location, before: item.quantity, after })
      }
      setDone(current => [...changed, ...current])
      setNotice(changed.length ? `Saved: ${found.name} is now ${changed.map(c => c.after).join(' / ')}.` : `${found.name}: the count matches, nothing to change.`)
      setFound(null); setCode('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the count') }
    finally { setBusy(false) }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); if (code.trim()) lookup(code.trim()) }
  const bump = (id: string, by: number) => setCounts(current => ({ ...current, [id]: String(Math.max(0, (Number(current[id]) || 0) + by)) }))

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/inventory"><ArrowLeft size={15} /> Inventory</Link>
    <div>
      <h1 className={s.title}>Stock count</h1>
      <p className={s.subtitle}>Scan a product&apos;s barcode with the camera, count what is on the shelf, and save. The product&apos;s stock is set to your count, and the change is kept in its stock history.</p>
      <p className={s.subtitle}>No barcode on the box? <Link className={ui.textLink} href="/admin/inventory/labels">Print barcode stickers</Link>.</p>
    </div>

    <section className={`${ui.card} ${s.settings}`}>
      {supported
        ? <div className={s.actions}>{cameraOn
          ? <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={stopCamera}><CameraOff size={16} /> Stop the camera</button>
          : <button type="button" className={ui.btn} onClick={startCamera}><Camera size={16} /> Scan with the camera</button>}</div>
        : <p className={ui.muted}>This browser can&apos;t read barcodes with the camera. Use Chrome on Android, or type the code below (a barcode scanner also works here).</p>}
      <video ref={video} playsInline muted style={{ display: cameraOn ? 'block' : 'none', width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12, background: '#000' }} />
      {cameraOn && <p className={ui.muted}>Point the camera at the barcode. It reads it by itself.</p>}
      <form className={s.row} onSubmit={submit}>
        <input className={ui.input} value={code} onChange={e => setCode(e.target.value)} placeholder="Barcode or SKU" aria-label="Barcode or SKU" inputMode="text" autoComplete="off" />
        <button type="submit" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy || !code.trim()}><ScanBarcode size={16} /> Find</button>
      </form>
    </section>

    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    {found && <section className={`${ui.card} ${s.card}`}>
      <div className={s.head}>
        <div className="inline" style={{ gap: 12 }}>
          {found.image && <img src={found.image} alt="" width={56} height={56} style={{ borderRadius: 10, objectFit: 'cover' }} />}
          <div><strong className={s.name}>{found.name}</strong>{found.variant && <div className={ui.muted}>{found.variant}</div>}<div className={ui.muted}>{found.sku}</div></div>
        </div>
      </div>
      {found.items.map(item => <div key={item.id} className={s.row} style={{ justifyContent: 'space-between' }}>
        <span><strong>{item.location}</strong><br /><span className={ui.muted}>System says {item.quantity}{item.reserved ? `, ${item.reserved} held for orders` : ''}</span></span>
        <span className={s.counter}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => bump(item.id, -1)} aria-label="One less" disabled={!canManage}><Minus size={16} /></button>
          <input className={ui.input} type="number" min={0} inputMode="numeric" value={counts[item.id] ?? ''} onChange={e => setCounts(current => ({ ...current, [item.id]: e.target.value }))} aria-label={`Counted at ${item.location}`} disabled={!canManage} />
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => bump(item.id, 1)} aria-label="One more" disabled={!canManage}><Plus size={16} /></button>
        </span>
      </div>)}
      {canManage
        ? <div className={s.actions}><button type="button" className={ui.btn} disabled={busy} onClick={save}><Check size={16} /> {busy ? 'Saving…' : 'Save the count'}</button><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setFound(null); setCode('') }}>Skip</button></div>
        : <p className={ui.muted}>You can look, but only staff who manage stock can save counts.</p>}
    </section>}

    {done.length > 0 && <section className={`${ui.card} ${s.card}`}>
      <strong className={s.name}>Counted now ({done.length})</strong>
      {done.map(c => <div key={c.key} className={s.row} style={{ justifyContent: 'space-between' }}><span>{c.name} <span className={ui.muted}>· {c.location}</span></span><span>{c.before} → <strong>{c.after}</strong> <span className={ui.muted}>({c.after - c.before > 0 ? '+' : ''}{c.after - c.before})</span></span></div>)}
    </section>}
  </div>
}
