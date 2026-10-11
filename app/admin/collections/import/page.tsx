import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import SpreadsheetImport from '@/components/spreadsheet-import'
import styles from '@/components/spreadsheet-import.module.css'
import ui from '@/components/admin-ui.module.css'

// Collections › Import: add or change collections from a spreadsheet (components/spreadsheet-import.tsx).
export default async function ImportCollections() {
  await requirePermission('collections.manage')
  return (
    <div className={styles.page}>
      <div className={ui.sectionHead}>
        <div>
          <Link className={ui.textLink} href="/admin/collections"><ArrowLeft size={15} /> Back to collections</Link>
          <span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>COLLECTIONS</span>
          <h1 className={ui.title}>Import collections</h1>
          <p className={ui.muted}>Add or change collections, and which products are in them, with a spreadsheet.</p>
        </div>
      </div>
      <SpreadsheetImport kind="collections" />
    </div>
  )
}
