'use client'

import { useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-content-editors.module.css'
import { useModalFocus } from './use-modal-focus'

// The add and edit dialogs of Admin > Online store > Pages, Blog and URL redirects
// (docs/admin-online-store-pages-2026-11.md). They were plain boxes over the page: focus stayed behind them, Tab
// walked out, Escape did nothing, the close button had no name, and a save that failed showed its message on the
// page behind the dark overlay, where nobody could see it.
// - A modal dialog named by its heading, with the storefront pop-ups' keyboard rules (components/use-modal-focus.ts):
//   focus starts on the field marked data-autofocus, Tab stays inside, Escape closes it, focus goes back.
// - While it saves it stays open (Escape, the overlay and Close wait).
// - `description`: a line under the title, read with it (Admin > Settings: Shipping and Tax use it).
export default function AdminFormDialog({ open, eyebrow, title, description, busy = false, onClose, children }: { open: boolean; eyebrow: string; title: string; description?: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useModalFocus(ref, open, () => { if (!busy) onClose() })
  if (!open) return null
  return (
    <div className={ui.modalOverlay} onClick={() => { if (!busy) onClose() }}>
      <div ref={ref} className={`${ui.card} discountsModal`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined} tabIndex={-1} onClick={event => event.stopPropagation()}>
        <div className="inventoryModalHead">
          <div><span className={`${ui.muted} ${ui.tiny}`}>{eyebrow}</span><h2 id={`${id}-title`}>{title}</h2>{description && <p id={`${id}-desc`} className={ui.muted}>{description}</p>}</div>
          <button type="button" className={ui.iconBtn} onClick={onClose} disabled={busy} aria-label="Close"><X size={17} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Why a save failed, in the dialog next to its buttons, read out when it appears.
export function DialogError({ error }: { error: string }) {
  return error ? <div className={`${ui.alert} ${ui.alertDanger} ${s.dialogError}`} role="alert">{error}</div> : null
}
