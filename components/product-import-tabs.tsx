'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, Globe } from 'lucide-react'
import ProductImportAdmin from './product-import-admin'
import SpreadsheetImport from './spreadsheet-import'
import styles from './spreadsheet-import.module.css'
import ui from './admin-ui.module.css'

// Products › Import: a spreadsheet of many products, or one product from another website (the
// browser button lands here with "#import=…", which opens that tab).
export default function ProductImportTabs({ bookmarklet, storeName, currency, initialTab }: { bookmarklet: string; storeName: string; currency: string; initialTab: 'spreadsheet' | 'link' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => { if (window.location.hash.startsWith('#import=')) setTab('link') }, [])
  return (
    <div className={styles.page}>
      <div className={ui.sectionHead}>
        <div>
          <Link className={ui.textLink} href="/admin/products"><ArrowLeft size={15} /> Back to products</Link>
          <span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>PRODUCTS</span>
          <h1 className={ui.title}>Import products</h1>
          <p className={ui.muted}>Add or change many products with a spreadsheet, or bring one in from another website.</p>
        </div>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Import from">
        <button type="button" role="tab" aria-selected={tab === 'spreadsheet'} className={tab === 'spreadsheet' ? styles.tabOn : ''} onClick={() => setTab('spreadsheet')}><FileSpreadsheet size={16} /> From a spreadsheet</button>
        <button type="button" role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? styles.tabOn : ''} onClick={() => setTab('link')}><Globe size={16} /> From another website</button>
      </div>
      {tab === 'spreadsheet' ? <SpreadsheetImport kind="products" /> : <ProductImportAdmin bookmarklet={bookmarklet} storeName={storeName} currency={currency} embedded />}
    </div>
  )
}
