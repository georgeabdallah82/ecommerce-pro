'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { useConfirm } from './admin-confirm'
import { useToast } from './admin-toast'
import ui from './admin-ui.module.css'

// "Delete chat" (app/api/admin/assistant/conversations): asks first, then removes the chat and its
// messages for good. `onDeleted` runs instead of going to `goTo` (the live chat inbox stays put).
export default function DeleteChatButton({ id, goTo, onDeleted, compact = false }: { id: string; goTo?: string; onDeleted?: () => void; compact?: boolean }) {
  const confirm = useConfirm()
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!(await confirm({ title: 'Delete this chat?', message: 'The chat and all its messages are deleted for good. The shopper keeps what is on their screen.', confirmLabel: 'Delete chat' }))) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/assistant/conversations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) { toast(data?.error || 'The chat could not be deleted. Please try again.', 'error'); return }
      toast('Chat deleted.')
      if (onDeleted) onDeleted()
      else if (goTo) { router.push(goTo); router.refresh() }
    } catch {
      toast('No connection. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return compact
    ? <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => void remove()} disabled={busy} aria-label="Delete chat" title="Delete chat"><Trash2 size={15} /></button>
    : <button type="button" className={`${ui.btn} ${ui.btnDanger}`} onClick={() => void remove()} disabled={busy}><Trash2 size={15} /> {busy ? 'Deleting…' : 'Delete chat'}</button>
}
