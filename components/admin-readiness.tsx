'use client'

import { AlertTriangle, Check, X } from 'lucide-react'
import type { ReadinessCheck } from '@/lib/editor-readiness'
import s from './admin-readiness.module.css'

// A compact strip above an editor's tabs: what must be fixed before the item can go live, and
// what is worth a look. Each item jumps to the tab where the fix is.
export function ReadinessStrip({ title, checks, onGo }: { title: string; checks: ReadinessCheck[]; onGo?: (tab: string) => void }) {
  const issues = checks.filter(c => c.status !== 'ok')
  const blocks = issues.filter(c => c.status === 'block').length
  const warnings = issues.length - blocks
  return <section className={s.strip} aria-label={title}>
    <div className={s.stripHead}>
      <strong>{title}</strong>
      <span className={blocks ? s.summaryBlock : warnings ? s.summaryWarn : s.summaryOk}>
        {blocks ? `${blocks} to fix` : warnings ? `${warnings} to review` : 'All set'}
      </span>
    </div>
    {issues.length > 0 && <ul className={s.issues}>
      {issues.map(c => <li key={c.id}>
        <button type="button" className={c.status === 'block' ? s.issueBlock : s.issueWarn} disabled={!c.tab || !onGo} onClick={() => c.tab && onGo?.(c.tab)} title={c.detail}>
          {c.status === 'block' ? <X size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
          <span><b>{c.label}</b> {c.detail}</span>
        </button>
      </li>)}
    </ul>}
  </section>
}

// Every check, in order, for a side panel.
export function ReadinessPanel({ checks }: { checks: ReadinessCheck[] }) {
  return <ul className={s.panelList}>
    {checks.map(c => <li key={c.id} className={s.panelItem}>
      <span className={c.status === 'ok' ? s.dotOk : c.status === 'warn' ? s.dotWarn : s.dotBlock} aria-hidden="true">
        {c.status === 'ok' ? <Check size={12} /> : c.status === 'warn' ? <AlertTriangle size={12} /> : <X size={12} />}
      </span>
      <div><strong>{c.label}</strong><small>{c.detail}</small></div>
    </li>)}
  </ul>
}
