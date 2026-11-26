'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send } from 'lucide-react'
import Link from './admin-link'
import DeleteChatButton from './admin-delete-chat'
import { useToast } from './admin-toast'
import { fetchRead } from '@/lib/retry-fetch'
import ui from './admin-ui.module.css'
import styles from './admin-live-chat.module.css'

// Admin › Online Store › Live chat (app/api/admin/live-chat): the "I'm online" switch, the chats
// waiting for a reply, and the reply box. New messages arrive over a live connection (worker.ts
// /api/live-chat/socket); nothing polls the database. Docs: docs/live-chat-2026-11.md.

type Presence = { online: boolean; name: string; since: number | null; staffConnected: number }
type InboxRow = { id: string; lang: string; waitingSince: string | null; updatedAt: string; customer: string | null; last: { role: string; text: string; at: string } | null }
type LiveMessage = { id: string; role: 'user' | 'assistant' | 'agent'; text: string; at: string; author?: string }
type Thread = { id: string; lang: string; waitingSince: string | null; customer: { id: string; name: string } | null; messages: LiveMessage[] }

const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const LANG: Record<string, string> = { en: 'English', ar: 'Arabic', arabizi: 'Lebanese (Latin letters)' }

export default function LiveChatInbox({ initialId, canDelete }: { initialId: string | null; canDelete: boolean }) {
  const toast = useToast()
  const [presence, setPresence] = useState<Presence | null>(null)
  const [available, setAvailable] = useState(true)
  const [inbox, setInbox] = useState<InboxRow[]>([])
  const [selected, setSelected] = useState<string | null>(initialId)
  const [thread, setThread] = useState<Thread | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const log = useRef<HTMLDivElement>(null)

  const loadInbox = useCallback(async () => {
    const res = await fetchRead('/api/admin/live-chat', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    setPresence(data.presence)
    setAvailable(!!data.available)
    setInbox(Array.isArray(data.inbox) ? data.inbox : [])
    return typeof data.ticket === 'string' ? data.ticket as string : null
  }, [])

  const loadThread = useCallback(async (id: string) => {
    const res = await fetchRead(`/api/admin/live-chat?c=${encodeURIComponent(id)}`, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.thread) setThread(data.thread)
    else { setThread(null); toast(data?.error || 'That chat could not be opened.', 'error') }
  }, [toast])

  useEffect(() => { if (selected) void loadThread(selected); else setThread(null) }, [selected, loadThread])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [thread?.messages.length])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])

  // The live connection: new shopper messages, other staff replies, and the online switch.
  useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let tries = 0
    let ping = 0
    let retry = 0
    let refresh = 0
    const refreshInbox = () => { window.clearTimeout(refresh); refresh = window.setTimeout(() => void loadInbox(), 400) }
    const connect = async () => {
      const ticket = await loadInbox()
      if (stopped || !ticket) return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live-chat/socket?ticket=${encodeURIComponent(ticket)}`)
      socket.onopen = () => { tries = 0; setConnected(true); ping = window.setInterval(() => socket?.readyState === 1 && socket.send('ping'), 45_000) }
      socket.onmessage = event => {
        if (typeof event.data !== 'string' || event.data === 'pong') return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'presence') setPresence(p => ({ ...(p || { since: null, staffConnected: 0 }), online: !!data.online, name: String(data.name || '') }))
          if (data.type === 'message' && data.conversationId === selectedRef.current && data.message) {
            setThread(t => (t && !t.messages.some(m => m.id === data.message.id) ? { ...t, messages: [...t.messages, data.message] } : t))
          }
          if (data.type === 'message' || data.type === 'waiting') refreshInbox()
        } catch { /* not ours */ }
      }
      socket.onclose = () => {
        setConnected(false)
        window.clearInterval(ping)
        if (stopped) return
        tries += 1
        retry = window.setTimeout(() => void connect(), Math.min(30_000, 1500 * 2 ** Math.min(tries, 5)))
      }
    }
    void connect()
    return () => { stopped = true; window.clearInterval(ping); window.clearTimeout(retry); window.clearTimeout(refresh); socket?.close() }
  }, [loadInbox])

  async function toggleOnline() {
    if (!presence) return
    setSwitching(true)
    try {
      const res = await fetch('/api/admin/live-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'presence', online: !presence.online }) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.presence) { toast(data?.error || 'Please try again.', 'error'); return }
      setPresence(data.presence)
      toast(data.presence.online ? 'You are online. Shoppers now chat with you.' : 'You are offline. The AI answers shoppers again.')
    } finally {
      setSwitching(false)
    }
  }

  async function sendReply(event?: React.FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || !thread || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/live-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reply', conversationId: thread.id, text }) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.message) { toast(data?.error || 'Not sent. Please try again.', 'error'); return }
      setDraft('')
      setThread(t => (t && !t.messages.some(m => m.id === data.message.id) ? { ...t, waitingSince: null, messages: [...t.messages, data.message] } : t))
      void loadInbox()
    } catch {
      toast('No connection. Please try again.', 'error')
    } finally {
      setSending(false)
    }
  }

  const waiting = inbox.filter(c => c.waitingSince)

  return (
    <div className={styles.page}>
      <div className={ui.sectionHead}>
        <div>
          <Link href="/admin/online-store/assistant" className={ui.textLink}>← AI shopping assistant</Link>
          <h1 className={ui.title}>Live chat</h1>
          <p className={ui.muted}>While you are online, shoppers&apos; typed messages come here instead of going to the AI. If nobody replies within 3 minutes, the AI answers and tells the shopper you&apos;ll also reply.</p>
        </div>
      </div>

      <section className={`${styles.switchCard} ${presence?.online ? styles.isOnline : ''}`}>
        <div>
          <strong>{presence?.online ? `You are online${presence.name ? ` as ${presence.name}` : ''}` : 'You are offline'}</strong>
          <span>{presence?.online ? 'Shoppers see "Chat with you · Online now" and their messages come here.' : 'The AI shopping assistant answers shoppers.'}</span>
        </div>
        <button type="button" className={`${ui.btn} ${presence?.online ? ui.btnSecondary : ''}`} onClick={() => void toggleOnline()} disabled={!presence || switching || !available}>
          {presence?.online ? 'Go offline' : 'Go online'}
        </button>
      </section>
      {!available ? <p className={styles.warn} role="status">Live chat only works on the live store (Cloudflare). Here, the AI answers shoppers.</p> : null}
      {available && !connected ? <p className={styles.muted}>Connecting…</p> : null}

      <div className={`${styles.layout} ${thread ? styles.hasThread : ''}`}>
        <section className={styles.inbox} aria-label="Chats">
          <h2>{waiting.length ? `Waiting for a reply (${waiting.length})` : 'Chats'}</h2>
          {inbox.length === 0 ? <p className={styles.muted}>No live chats yet. When you&apos;re online, new messages show up here.</p> : null}
          <ul>
            {inbox.map(c => (
              <li key={c.id}>
                <button type="button" className={`${styles.row} ${c.id === selected ? styles.rowOn : ''}`} onClick={() => setSelected(c.id)} aria-current={c.id === selected ? 'true' : undefined}>
                  <span className={styles.rowTop}>
                    <strong>{c.customer || 'Guest'}</strong>
                    {c.waitingSince ? <span className={styles.waitPill}>Waiting {minutesSince(c.waitingSince, now)} min</span> : <small>{time(c.updatedAt)}</small>}
                  </span>
                  <span className={styles.preview} dir="auto">{c.last ? `${c.last.role === 'agent' ? 'You: ' : c.last.role === 'assistant' ? 'AI: ' : ''}${c.last.text}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.thread} aria-label="Chat">
          {thread ? (
            <>
              <header className={styles.threadHead}>
                <button type="button" className={`${ui.iconBtn} ${styles.back}`} onClick={() => setSelected(null)} aria-label="Back to chats"><ArrowLeft size={16} /></button>
                <div>
                  <strong>{thread.customer ? <Link href={`/admin/customers/${thread.customer.id}`}>{thread.customer.name}</Link> : 'Guest'}</strong>
                  <span>{LANG[thread.lang] || thread.lang}</span>
                </div>
                <Link href={`/admin/online-store/assistant/${thread.id}`} className={ui.textLink}>Full chat</Link>
                {canDelete ? <DeleteChatButton id={thread.id} compact onDeleted={() => { setSelected(null); setThread(null); void loadInbox() }} /> : null}
              </header>
              <div className={styles.messages} ref={log} role="log" aria-live="polite">
                {thread.messages.map(m => (
                  <div key={m.id} className={m.role === 'user' ? styles.fromShopper : m.role === 'agent' ? styles.fromAgent : styles.fromAi}>
                    <span className={styles.meta}>{m.role === 'user' ? 'Shopper' : m.role === 'agent' ? (m.author || 'You') : 'AI / buttons'} · {time(m.at)}</span>
                    <p dir="auto">{m.text}</p>
                  </div>
                ))}
              </div>
              <form className={styles.compose} onSubmit={sendReply}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value.slice(0, 2000))}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendReply() } }}
                  placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
                  aria-label="Your reply"
                  rows={2}
                  dir="auto"
                  className={ui.textarea}
                />
                <button type="submit" className={ui.btn} disabled={!draft.trim() || sending}><Send size={15} /> {sending ? 'Sending…' : 'Send'}</button>
              </form>
            </>
          ) : <p className={styles.empty}>Choose a chat to read and reply.</p>}
        </section>
      </div>
    </div>
  )
}
