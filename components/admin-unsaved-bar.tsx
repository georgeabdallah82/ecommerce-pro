'use client'

import { Save } from 'lucide-react'
import ui from './admin-ui.module.css'
import styles from './admin-unsaved-bar.module.css'

// `error`: why the last save failed, said in the bar (it stays in view while scrolling, where Save was pressed) and
// read out when it appears (Admin > Settings, docs/admin-settings-2026-11.md).
export default function UnsavedBar({
  dirty, saving, onDiscard, onSave, label = 'Unsaved changes', error = '',
}: { dirty: boolean; saving?: boolean; onDiscard: () => void; onSave: () => void; label?: string; error?: string }) {
  if (!dirty) return null
  return (
    <div className={styles.bar}>
      {error ? <span className={`${styles.label} ${styles.error}`} role="alert">Not saved: {error}</span> : <span className={styles.label}>{label}</span>}
      <div className={styles.actions}>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={onDiscard} disabled={saving}>Discard</button>
        <button className={ui.btn} onClick={onSave} disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}
