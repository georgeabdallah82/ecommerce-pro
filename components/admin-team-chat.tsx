'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, BellOff, Hash, Send, Trash2, User } from 'lucide-react'
import Link from './admin-link'
import { useConfirm } from './admin-confirm'
import { useToast } from './admin-toast'
import { fetchRead } from '@/lib/retry-fetch'
import ui from './admin-ui.module.css'
import styles from './admin-team-chat.module.css'

// Admin › Team chat (app/api/admin/team-chat): the team room and direct chats between staff. New
// messages arrive over the live chat relay (worker.ts /api/live-chat/socket); nothing polls the
// database. Docs: docs/team-chat-2026-11.md.

type Channel = { id: string; kind: 'team' | 'direct'; title: string; otherUserId: string | null; unread: number; muted: boolean; lastAt: string | null; last: string | null }
type Message = { id: string; authorId: string; authorName: string; text: string; at: string; deleted?: boolean }
type Staff = { id: string; name: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// "#1042" or "ORD-20261126-0007" becomes a link to that order.
const ORDER_REF = /(#[A-Za-z0-9-]{3,30}|\bORD-[A-Za-z0-9-]{3,30})/g
function withOrderLinks(text: string) {
  return text.split(ORDER_REF).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
    const number = part.replace(/^#/, '')
    return <Link key={i} href={`/admin/orders/number/${encodeURIComponent(number)}`} className={styles.orderLink}>{part}</Link>
  })
}

export default function TeamChat({ initialChannel }: { initialChannel: string | null }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [me, setMe] = useState<{ id: string; isOwner: boolean } | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [selected, setSelected] = useState<string | null>(initialChannel)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [showList, setShowList] = useState(!initialChannel)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const meRef = useRef(me)
  meRef.current = me
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const loadList = useCallback(async () => {
    const res = await fetchRead('/api/admin/team-chat', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    setMe(data.me)
    setChannels(data.channels || [])
    setStaff(data.staff || [])
    setSelected(s => s ?? data.channels?.[0]?.id ?? null)
    return typeof data.ticket === 'string' ? data.ticket as string : null
  }, [])

  const loadMessages = useCallback(async (channelId: string) => {
    const res = await fetchRead(`/api/admin/team-chat?c=${encodeURIComponent(channelId)}`, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) { toast(data?.error || 'That chat could not be opened.', 'error'); return }
    stick.current = true
    setMessages(data.messages || [])
    setHasOlder((data.messages || []).length >= 60)
    setChannels(list => list.map(c => (c.id === channelId ? { ...c, unread: 0 } : c)))
  }, [toast])

  useEffect(() => { if (selected) void loadMessages(selected) }, [selected, loadMessages])
  useEffect(() => { if (stick.current) log.current?.scrollTo({ top: log.current.scrollHeight }) }, [messages])

  // New messages from the relay: into the open chat (and marked read), or as an unread count.
  useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let tries = 0
    let ping = 0
    let retry = 0
    let readTimer = 0
    const connect = async () => {
      const ticket = await loadList()
      if (stopped) return
      if (!ticket) { setConnected(false); return }
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live-chat/socket?ticket=${encodeURIComponent(ticket)}`)
      socket.onopen = () => { tries = 0; setConnected(true); ping = window.setInterval(() => socket?.readyState === 1 && socket.send('ping'), 45_000) }
      socket.onmessage = event => {
        if (typeof event.data !== 'string' || event.data === 'pong') return
        let data: { type?: string; channelId?: string; message?: Message }
        try { data = JSON.parse(event.data) } catch { return }
        if (data.type !== 'team' || !data.channelId || !data.message) return
        const { channelId, message } = data
        const mine = message.authorId === meRef.current?.id
        if (channelId === selectedRef.current) {
          setMessages(list => (list.some(m => m.id === message.id) ? list.map(m => (m.id === message.id ? message : m)) : [...list, message]))
          if (!mine && !message.deleted) {
            window.clearTimeout(readTimer)
            readTimer = window.setTimeout(() => void fetch('/api/admin/team-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', channelId }), keepalive: true }), 300)
          }
        }
        setChannels(list => {
          if (!list.some(c => c.id === channelId)) { void loadList(); return list }
          return list.map(c => c.id !== channelId ? c : {
            ...c,
            lastAt: message.at,
            last: message.deleted ? 'Message deleted' : `${message.authorName}: ${message.text}`.slice(0, 120),
            unread: channelId === selectedRef.current || mine || message.deleted ? c.unread : c.unread + 1,
          }).sort((a, b) => (a.kind === 'team' ? -1 : b.kind === 'team' ? 1 : (b.lastAt || '').localeCompare(a.lastAt || '')))
        })
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
    return () => { stopped = true; window.clearInterval(ping); window.clearTimeout(retry); window.clearTimeout(readTimer); socket?.close() }
  }, [loadList])

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/team-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Please try again.')
    return data
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || !selected || sending) return
    setSending(true)
    try {
      const data = await post({ action: 'send', channelId: selected, text })
      setDraft('')
      stick.current = true
      setMessages(list => (list.some(m => m.id === data.message.id) ? list : [...list, data.message]))
      setChannels(list => list.map(c => (c.id === selected ? { ...c, lastAt: data.message.at, last: `${data.message.authorName}: ${data.message.text}`.slice(0, 120) } : c)))
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Not sent.', 'error')
    } finally {
      setSending(false)
    }
  }

  async function remove(message: Message) {
    if (!(await confirm({ title: 'Delete this message?', message: 'Everyone in this chat will see "Message deleted" instead.', confirmLabel: 'Delete message' }))) return
    try {
      await post({ action: 'delete', messageId: message.id })
      setMessages(list => list.map(m => (m.id === message.id ? { ...m, text: '', deleted: true } : m)))
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Not deleted.', 'error')
    }
  }

  async function toggleMute(channel: Channel) {
    try {
      await post({ action: 'mute', channelId: channel.id, muted: !channel.muted })
      setChannels(list => list.map(c => (c.id === channel.id ? { ...c, muted: !channel.muted } : c)))
      toast(channel.muted ? 'Phone notifications on for this chat.' : 'Phone notifications muted for this chat.')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Please try again.', 'error')
    }
  }

  async function startDirect(userId: string) {
    if (!userId) return
    try {
      const data = await post({ action: 'dm', userId })
      await loadList()
      open(data.channelId)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Please try again.', 'error')
    }
  }

  async function loadOlder() {
    if (!selected || !messages.length) return
    const res = await fetchRead(`/api/admin/team-chat?c=${encodeURIComponent(selected)}&before=${encodeURIComponent(messages[0].at)}`, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return
    stick.current = false
    setMessages(list => [...(data.messages || []), ...list])
    setHasOlder((data.messages || []).length >= 60)
  }

  function open(channelId: string) {
    setSelected(channelId)
    setShowList(false)
    window.history.replaceState(null, '', `/admin/team-chat?c=${encodeURIComponent(channelId)}`)
  }

  const current = channels.find(c => c.id === selected) || null
  const withoutChat = staff.filter(s => !channels.some(c => c.otherUserId === s.id))

  return (
    <div className={styles.page}>
      <div className={ui.sectionHead}>
        <div>
          <span className={ui.muted}>HOME</span>
          <h1 className={ui.title}>Team chat</h1>
          <p className={ui.muted}>Talk with the rest of the staff: the team room for everyone, or a direct chat with one person. Type an order number like #1042 to link it. Messages are kept 90 days.</p>
        </div>
      </div>
      {connected === false ? <p className={styles.warn} role="status">Messages from others show when you reopen a chat: instant delivery only works on the live store (Cloudflare).</p> : null}

      <div className={`${styles.layout} ${showList ? '' : styles.threadOpen}`}>
        <aside className={styles.list} aria-label="Chats">
          <ul>
            {channels.map(c => (
              <li key={c.id}>
                <button type="button" className={`${styles.row} ${c.id === selected ? styles.rowOn : ''}`} onClick={() => open(c.id)} aria-current={c.id === selected ? 'true' : undefined}>
                  <span className={styles.rowIcon} aria-hidden="true">{c.kind === 'team' ? <Hash size={16} /> : <User size={16} />}</span>
                  <span className={styles.rowText}>
                    <strong>{c.title}{c.muted ? <BellOff size={12} aria-label="Muted" className={styles.mutedIcon} /> : null}</strong>
                    <span>{c.last || (c.kind === 'team' ? 'Say hello to the team' : 'No messages yet')}</span>
                  </span>
                  {c.unread ? <span className={styles.unread} aria-label={`${c.unread} unread`}>{c.unread > 99 ? '99+' : c.unread}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {withoutChat.length ? (
            <label className={styles.newChat}>
              <span className={ui.fieldLabel}>Message a colleague</span>
              <select className={ui.input} value="" onChange={e => void startDirect(e.target.value)}>
                <option value="">Choose a person…</option>
                {withoutChat.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ) : null}
        </aside>

        <section className={styles.thread} aria-label={current?.title || 'Chat'}>
          {current ? (
            <>
              <header className={styles.threadHead}>
                <button type="button" className={`${ui.iconBtn} ${styles.back}`} onClick={() => setShowList(true)} aria-label="Back to chats"><ArrowLeft size={16} /></button>
                <strong>{current.kind === 'team' ? <Hash size={15} aria-hidden="true" /> : null}{current.title}</strong>
                <button type="button" className={ui.iconBtn} onClick={() => void toggleMute(current)} aria-label={current.muted ? 'Turn phone notifications on for this chat' : 'Mute phone notifications for this chat'} title={current.muted ? 'Notifications muted' : 'Notifications on'}>
                  {current.muted ? <BellOff size={16} /> : <Bell size={16} />}
                </button>
              </header>
              <div className={styles.messages} ref={log} role="log" aria-live="polite">
                {hasOlder ? <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${styles.older}`} onClick={() => void loadOlder()}>Load earlier messages</button> : null}
                {messages.length === 0 ? <p className={styles.empty}>{current.kind === 'team' ? 'No messages in the team room yet.' : `Start your chat with ${current.title}.`}</p> : null}
                {messages.map((m, i) => {
                  const mine = m.authorId === me?.id
                  const newDay = i === 0 || day(messages[i - 1].at) !== day(m.at)
                  return (
                    <Fragment key={m.id}>
                      {newDay ? <p className={styles.day}>{day(m.at)}</p> : null}
                      <div className={`${styles.message} ${mine ? styles.mine : ''}`}>
                        <span className={styles.meta}>{mine ? 'You' : m.authorName} · {time(m.at)}</span>
                        {m.deleted ? <p className={styles.deleted}>Message deleted</p> : <p dir="auto">{withOrderLinks(m.text)}</p>}
                        {!m.deleted && (mine || me?.isOwner) ? (
                          <button type="button" className={styles.delete} onClick={() => void remove(m)} aria-label="Delete message" title="Delete message"><Trash2 size={13} /></button>
                        ) : null}
                      </div>
                    </Fragment>
                  )
                })}
              </div>
              <form className={styles.compose} onSubmit={send}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value.slice(0, 2000))}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
                  placeholder={current.kind === 'team' ? 'Message the team… (Enter to send)' : `Message ${current.title}… (Enter to send)`}
                  aria-label="Your message"
                  rows={2}
                  dir="auto"
                  className={ui.textarea}
                />
                <button type="submit" className={ui.btn} disabled={!draft.trim() || sending}><Send size={15} /> {sending ? 'Sending…' : 'Send'}</button>
              </form>
            </>
          ) : <p className={styles.empty}>Choose a chat.</p>}
        </section>
      </div>
    </div>
  )
}
