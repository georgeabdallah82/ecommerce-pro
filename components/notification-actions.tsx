'use client'
import { useState } from 'react'
import { useI18n } from '@/components/lang-provider'

export function MarkAllReadButton() {
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()
  async function markAll() {
    setBusy(true)
    try {
      const res = await fetch('/api/account/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (res.ok) window.location.reload()
      else setBusy(false)
    } catch {
      setBusy(false)
    }
  }
  return <button className="btn secondary" type="button" onClick={markAll} disabled={busy}>{busy ? t('Marking…') : t('Mark all as read')}</button>
}

export function MarkReadButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()
  async function markRead() {
    setBusy(true)
    try {
      const res = await fetch('/api/account/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (res.ok) window.location.reload()
      else setBusy(false)
    } catch {
      setBusy(false)
    }
  }
  return <button className="btn secondary" type="button" onClick={markRead} disabled={busy}>{busy ? t('Marking…') : t('Mark as read')}</button>
}
