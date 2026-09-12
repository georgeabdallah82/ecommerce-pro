'use client'

import { Save } from 'lucide-react'
import ui from './admin-ui.module.css'
import styles from './admin-unsaved-bar.module.css'

export default function UnsavedBar({
  dirty, saving, onDiscard, onSave, label = 'Unsaved changes',
}: { dirty: boolean; saving?: boolean; onDiscard: () => void; onSave: () => void; label?: string }) {
  if (!dirty) return null
  return (
    <div className={styles.bar}>
      <span className={styles.label}>{label}</span>
      <div className={styles.actions}>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={onDiscard} disabled={saving}>Discard</button>
        <button className={ui.btn} onClick={onSave} disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}
