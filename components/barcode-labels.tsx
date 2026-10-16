'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from '@/components/admin-link'
import { ArrowLeft, Printer, Search } from 'lucide-react'
import { money } from '@/lib/config'
import { canEncode, code128Path } from '@/lib/code128'
import { LABEL_LAYOUTS, labelPages, moduleWidthMm, type LabelLayoutKey } from '@/lib/labels'
import { NumInput } from './num-input'
import s from './bring-back.module.css'
import b from './barcode-labels.module.css'
import ui from './admin-ui.module.css'

export type LabelRow = { key: string; productId: string; name: string; variant: string; code: string; fromBox: boolean; price: number; stock: number; draft: boolean }

function Sticker({ row, layout, showPrice, currency }: { row: LabelRow; layout: LabelLayoutKey; showPrice: boolean; currency: string }) {
  const size = LABEL_LAYOUTS[layout]
  const bars = code128Path(row.code, 40)
  return <div className={`${b.sticker}${size.h < 32 ? ` ${b.small}` : ''}`} style={{ ['--w' as string]: `${size.w}mm`, ['--h' as string]: `${size.h}mm` }}>
    <div className={b.top}>
      <span className={b.name}>{row.name}{row.variant && <span className={b.variant}>{row.variant}</span>}</span>
      {showPrice && <span className={b.price}>{money(row.price, currency)}</span>}
    </div>
    <svg className={b.bars} viewBox={`0 0 ${bars.width} 40`} preserveAspectRatio="none" aria-label={`Barcode ${row.code}`}><path d={bars.d} fill="#000" /></svg>
    <div className={b.code}>{row.code}</div>
  </div>
}

// Products > Barcode stickers (app/admin/inventory/labels): choose how many of each, print on an
// A4 sticker sheet or a label printer, then scan them in Stock count.
export default function BarcodeLabels({ rows, currency }: { rows: LabelRow[]; currency: string }) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [onlyNoBox, setOnlyNoBox] = useState(false)
  const [layout, setLayout] = useState<LabelLayoutKey>('a4_24')
  const [showPrice, setShowPrice] = useState(true)
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = b.printHost
    document.body.appendChild(el)
    setHost(el)
    return () => { el.remove() }
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => (!onlyNoBox || !r.fromBox) && (!q || `${r.name} ${r.variant} ${r.code}`.toLowerCase().includes(q)))
  }, [rows, search, onlyNoBox])
  const setAll = (n: (r: LabelRow) => number) => setQty(current => ({ ...current, ...Object.fromEntries(shown.filter(r => canEncode(r.code)).map(r => [r.key, n(r)])) }))

  const stickers = useMemo(() => rows.flatMap(r => canEncode(r.code) ? Array.from({ length: Math.min(500, qty[r.key] || 0) }, () => r) : []), [rows, qty])
  const pages = labelPages(stickers, layout)
  const size = LABEL_LAYOUTS[layout]

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/inventory/count"><ArrowLeft size={15} /> Stock count</Link>
    <div>
      <h1 className={s.title}>Barcode stickers</h1>
      <p className={s.subtitle}>For products with no barcode on the box, or to label shelves. Each sticker carries the product&apos;s barcode, or its SKU when it has none, so Stock count and any barcode scanner find the product.</p>
    </div>

    <section className={`${ui.card} ${s.card}`}>
      <strong className={s.name}>Sticker size</strong>
      <div className={s.chips} role="radiogroup" aria-label="Sticker size">
        {(Object.keys(LABEL_LAYOUTS) as LabelLayoutKey[]).map(k => <button key={k} type="button" role="radio" aria-checked={layout === k} className={`${s.chip}${layout === k ? ` ${s.chipOn}` : ''}`} onClick={() => setLayout(k)}>{LABEL_LAYOUTS[k].label}</button>)}
      </div>
      <label className="inline" style={{ gap: 8 }}><input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} /> Show the price on the sticker</label>
      <div className={s.actions}>
        <button type="button" className={ui.btn} disabled={!stickers.length} onClick={() => window.print()}><Printer size={16} /> Print {stickers.length} sticker{stickers.length === 1 ? '' : 's'}{size.perPage > 1 && stickers.length ? ` (${pages.length} sheet${pages.length === 1 ? '' : 's'})` : ''}</button>
      </div>
      <p className={ui.muted}>In the print window, choose your printer, set the paper to {size.paper} and the scale to 100% (&quot;Actual size&quot;), with no margins.</p>
      {stickers.length > 0 && <div className={b.preview} aria-label="Preview">{stickers.slice(0, 6).map((r, i) => <Sticker key={`${r.key}-${i}`} row={r} layout={layout} showPrice={showPrice} currency={currency} />)}{stickers.length > 6 && <span className={ui.muted} style={{ alignSelf: 'center' }}>and {stickers.length - 6} more</span>}</div>}
    </section>

    <section className={`${ui.card} ${s.card}`}>
      <div className={s.row}>
        <label className="inline" style={{ flex: '1 1 220px', gap: 6 }}><Search size={16} /><input className={ui.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a product" aria-label="Find a product" /></label>
      </div>
      <div className={s.chips}>
        <button type="button" className={`${s.chip}${!onlyNoBox ? ` ${s.chipOn}` : ''}`} onClick={() => setOnlyNoBox(false)}>All products</button>
        <button type="button" className={`${s.chip}${onlyNoBox ? ` ${s.chipOn}` : ''}`} onClick={() => setOnlyNoBox(true)}>No barcode on the box</button>
      </div>
      <div className={s.actions}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAll(() => 1)}>1 of each</button>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAll(r => r.stock)}>As many as in stock</button>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAll(() => 0)}>None</button>
      </div>
      {!shown.length ? <p className={ui.muted}>No products match.</p> : <div className={ui.tableWrap}><table className={`${ui.table} ${ui.cardTable}`}>
        <thead><tr><th>Product</th><th>In stock</th><th>Stickers</th></tr></thead>
        <tbody>{shown.map(r => {
          const ok = canEncode(r.code)
          const tooThin = ok && moduleWidthMm(r.code, layout) < 0.25
          return <tr key={r.key}>
            <td data-cell="primary">
              <Link className={ui.textLink} href={`/admin/products/${r.productId}`}>{r.name}</Link>{r.draft && <span className={b.badge}>Draft</span>}
              {r.variant && <div className={ui.muted}>{r.variant}</div>}
              <div className={ui.muted}>{r.code}<span className={`${b.badge}${r.fromBox ? '' : ` ${b.badgeSku}`}`}>{r.fromBox ? 'Barcode' : 'SKU'}</span></div>
              {!ok && <div className={b.warn}>This code has characters a barcode can&apos;t hold. Change the product&apos;s SKU to plain letters and numbers.</div>}
              {tooThin && <div className={b.warn}>Long code: it may not scan on stickers this small. Choose a bigger size.</div>}
            </td>
            <td data-label="In stock">{r.stock}</td>
            <td data-label="Stickers"><NumInput className={ui.input} style={{ width: 84 }} value={qty[r.key] ?? 0} empty={0} disabled={!ok} onValue={n => setQty(current => ({ ...current, [r.key]: Math.max(0, Math.min(500, Math.floor(n ?? 0))) }))} aria-label={`Stickers for ${r.name}${r.variant ? ` ${r.variant}` : ''}`} /></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>

    {host && createPortal(<>
      <style>{`@media print { @page { size: ${size.page}; margin: 0; } }`}</style>
      {pages.map((page, p) => <div key={p} className={b.sheet} style={{ ['--cols' as string]: String(size.cols), ['--w' as string]: `${size.w}mm`, ['--h' as string]: `${size.h}mm` }}>
        {page.map((r, i) => <Sticker key={`${r.key}-${p}-${i}`} row={r} layout={layout} showPrice={showPrice} currency={currency} />)}
      </div>)}
    </>, host)}
  </div>
}
