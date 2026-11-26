'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { money } from '@/lib/config'
import type { AssistantSuggestion, ChatReply, QuickAction } from '@/lib/assistant/config'
import styles from './assistant-widget.module.css'

// The AI shopping assistant's chat window (Admin › AI assistant switches it on). Quick-action
// buttons are answered from the store's data; typed messages may be answered by Claude
// (app/api/assistant). Product cards, order links and contact buttons come from the server, never
// from the AI's text. The chat is kept for this browser tab (sessionStorage). Docs:
// docs/ai-assistant-2026-11.md.
//
// Live chat (docs/live-chat-2026-11.md): while someone from the store is online, typed messages go to
// them (Admin › Live chat) and their replies arrive over a live connection (worker.ts
// /api/live-chat/socket). If nobody replies within 3 minutes, the chat asks the AI to step in.

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; reply: ChatReply }
  | { id: string; role: 'agent'; text: string; author: string }
  | { id: string; role: 'notice'; text: string }
  | { id: string; role: 'error'; text: string; retry?: Payload }

type Payload = { message?: string; action?: QuickAction | 'track_order_form' | 'ai_fallback'; orderNumber?: string; contact?: string; label?: string }
// waitingSince: when the shopper's message went to a person and no reply has come yet (ms).
type Saved = { conversationId: string | null; messages: Message[]; waitingSince?: number | null }
type Live = { online: boolean; name: string }
type LiveMessage = { id: string; role: 'user' | 'assistant' | 'agent'; text: string; at: string; author?: string }

const STORAGE_KEY = 'assistant.chat'
const MAX_LENGTH = 500
// Pages where the chat stays out of the way: checkout, staff pages and the theme editor's preview.
const HIDDEN = [/^\/checkout/, /^\/admin/, /^\/driver\//, /^\/theme-editor-preview/, /^\/(ar\/)?order\//]

const uid = () => Math.random().toString(36).slice(2, 10)
// The AI steps in when nobody from the store has replied after this long (lib/live-chat/server.ts).
const AI_FALLBACK_MS = 3 * 60 * 1000

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Saved
      if (Array.isArray(saved.messages)) return { conversationId: typeof saved.conversationId === 'string' ? saved.conversationId : null, messages: saved.messages.slice(-60), waitingSince: typeof saved.waitingSince === 'number' ? saved.waitingSince : null }
    }
  } catch { /* private mode or a broken entry: start fresh */ }
  return { conversationId: null, messages: [] }
}

export function AssistantWidget({ welcome, welcomeAr, suggestions, side, storeName }: { welcome: string; welcomeAr: string; suggestions: AssistantSuggestion[]; side: 'left' | 'right'; storeName: string }) {
  const { t, lang, dir } = useI18n()
  const pathname = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<Saved>({ conversationId: null, messages: [] })
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [tucked, setTucked] = useState(false)
  const [live, setLive] = useState<Live>({ online: false, name: '' })
  const [unread, setUnread] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  const launcher = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => { setState(load()); setReady(true) }, [])
  useEffect(() => {
    if (!ready) return
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* not saved: fine */ }
  }, [state, ready])
  useEffect(() => { if (open) log.current?.scrollTo({ top: log.current.scrollHeight }) }, [open, state.messages.length, busy])
  useEffect(() => { if (open) input.current?.focus() }, [open])

  // On phones it slides away while the shopper scrolls down, like the WhatsApp button.
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y > last + 4 && y > 240) setTucked(true)
      else if (y < last - 4) setTucked(false)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = useCallback(() => { setOpen(false); window.setTimeout(() => launcher.current?.focus(), 0) }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // A reply from the store's person: added once (by its id), the wait cleared.
  const addAgent = useCallback((items: LiveMessage[]) => {
    const agents = items.filter(m => m.role === 'agent')
    if (!agents.length) return
    setState(s => {
      const seen = new Set(s.messages.map(m => m.id))
      const fresh = agents.filter(m => !seen.has(m.id)).map(m => ({ id: m.id, role: 'agent' as const, text: m.text, author: m.author || '' }))
      return fresh.length ? { ...s, messages: [...s.messages.filter(m => m.role !== 'notice'), ...fresh], waitingSince: null } : s
    })
    if (!openRef.current) setUnread(true)
  }, [])

  // Online or not, a pass for the live connection, and replies missed while the window was closed.
  const sync = useCallback(async (conversationId: string | null) => {
    try {
      const res = await fetch('/api/assistant/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, after: conversationId ? new Date(0).toISOString() : undefined }) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) return null
      setLive({ online: !!data.online, name: String(data.name || '') })
      if (Array.isArray(data.messages)) addAgent(data.messages)
      return typeof data.ticket === 'string' ? data.ticket as string : null
    } catch {
      return null
    }
  }, [addAgent])

  // Whether someone is online, each time the window opens.
  useEffect(() => { if (open && ready) void sync(state.conversationId) }, [open, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // The live connection, while this tab has a chat that a person took part in or is waiting on.
  const liveChat = state.waitingSince != null || state.messages.some(m => m.role === 'agent')
  useEffect(() => {
    if (!ready || !state.conversationId || !liveChat) return
    let socket: WebSocket | null = null
    let stopped = false
    let tries = 0
    let ping = 0
    let retry = 0
    const connect = async () => {
      const ticket = await sync(state.conversationId)
      if (stopped || !ticket) return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live-chat/socket?ticket=${encodeURIComponent(ticket)}`)
      socket.onopen = () => { tries = 0; ping = window.setInterval(() => socket?.readyState === 1 && socket.send('ping'), 45_000) }
      socket.onmessage = event => {
        if (typeof event.data !== 'string' || event.data === 'pong') return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'presence') setLive({ online: !!data.online, name: String(data.name || '') })
          if (data.type === 'message' && data.conversationId === state.conversationId && data.message) addAgent([data.message])
        } catch { /* not ours */ }
      }
      socket.onclose = () => {
        window.clearInterval(ping)
        if (stopped || tries >= 6) return
        tries += 1
        retry = window.setTimeout(() => void connect(), Math.min(30_000, 1500 * 2 ** tries))
      }
    }
    void connect()
    return () => { stopped = true; window.clearInterval(ping); window.clearTimeout(retry); socket?.close() }
  }, [ready, state.conversationId, liveChat, sync, addAgent])

  const send = useCallback(async (payload: Payload) => {
    if (busy) return
    const shown = payload.label || payload.message || ''
    setState(s => ({ ...s, messages: [...s.messages.filter(m => m.role !== 'error'), ...(shown ? [{ id: uid(), role: 'user' as const, text: shown }] : [])] }))
    setBusy(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: state.conversationId, message: payload.message, action: payload.action, orderNumber: payload.orderNumber, contact: payload.contact, page: pathname, lang }),
      })
      const data = await res.json().catch(() => null)
      // The AI stepping in found nothing to do (a person already replied).
      if (payload.action === 'ai_fallback' && res.ok && !data?.reply) { setState(s => ({ ...s, waitingSince: null })); return }
      if (res.ok && data?.reply?.live?.waiting) {
        // Sent to a person: a note instead of an answer, and the 3-minute wait starts (or goes on).
        const name = String(data.reply.live.name || storeName)
        setState(s => ({ conversationId: data.conversationId || s.conversationId, messages: [...s.messages.filter(m => m.role !== 'notice'), { id: uid(), role: 'notice', text: t('Sent. {name} will reply here.', { name }) }], waitingSince: s.waitingSince ?? Date.now() }))
        return
      }
      if (!res.ok || !data?.reply) {
        const text = typeof data?.error === 'string' ? data.error : t('Something went wrong. Please try again.')
        setState(s => ({ ...s, messages: [...s.messages, { id: uid(), role: 'error', text, retry: res.status === 429 || res.status === 400 ? undefined : { ...payload, label: '' } }] }))
        return
      }
      setState(s => ({ conversationId: data.conversationId || s.conversationId, messages: [...s.messages.filter(m => m.role !== 'notice'), { id: uid(), role: 'assistant', reply: data.reply as ChatReply }], waitingSince: payload.action === 'ai_fallback' ? null : s.waitingSince }))
    } catch {
      setState(s => ({ ...s, messages: [...s.messages, { id: uid(), role: 'error', text: t('No connection. Check your internet and try again.'), retry: { ...payload, label: '' } }] }))
    } finally {
      setBusy(false)
    }
  }, [busy, state.conversationId, pathname, lang, t, storeName])

  // Nobody replied in 3 minutes: the AI steps in (the server checks the wait and runs it only once).
  useEffect(() => {
    if (!state.waitingSince) return
    const timer = window.setTimeout(() => void send({ action: 'ai_fallback' }), Math.max(0, state.waitingSince + AI_FALLBACK_MS - Date.now()))
    return () => window.clearTimeout(timer)
  }, [state.waitingSince, send])

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault()
    const text = draft.trim().slice(0, MAX_LENGTH)
    if (!text || busy) return
    setDraft('')
    void send({ message: text })
  }

  const newChat = () => { setState({ conversationId: null, messages: [], waitingSince: null }); setDraft(''); input.current?.focus() }
  const pick = (s: AssistantSuggestion) => {
    const label = lang === 'ar' ? s.labelAr || s.label : s.label
    void send(s.action ? { action: s.action, label } : { message: s.message, label })
  }

  if (HIDDEN.some(re => re.test(pathname))) return null
  const greeting = lang === 'ar' ? welcomeAr || welcome : welcome
  const last = state.messages[state.messages.length - 1]
  const latestReply = [...state.messages].reverse().find(m => m.role === 'assistant')?.id
  const ended = last?.role === 'assistant' && last.reply.ended
  const showSuggestions = !busy && (state.messages.length === 0 || ended)

  return (
    <aside className={`${styles.dock} ${side === 'left' ? styles.left : styles.right}`} aria-label={t('Shopping assistant')}>
      {open ? (
        <div className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="assistant-title" dir={dir}>
          <header className={styles.head}>
            <span className={styles.avatar} aria-hidden="true">{live.online ? <MessageCircle size={18} /> : <Sparkles size={18} />}</span>
            <div className={styles.titles}>
              <strong id="assistant-title">{live.online ? t('Chat with {name}', { name: live.name || storeName }) : t('Shopping assistant')}</strong>
              {live.online ? <span className={styles.online}><i aria-hidden="true" />{t('Online now')}</span> : <span>{storeName}</span>}
            </div>
            {state.messages.length ? <button type="button" className={styles.iconButton} onClick={newChat} aria-label={t('New chat')} title={t('New chat')}><RotateCcw size={17} /></button> : null}
            <button type="button" className={styles.iconButton} onClick={close} aria-label={t('Close chat')} title={t('Close chat')}><X size={19} /></button>
          </header>

          <div className={styles.log} ref={log} role="log" aria-live="polite" aria-busy={busy}>
            <div className={`${styles.bubble} ${styles.bot}`} dir="auto">{greeting}</div>
            {state.messages.map(m => (
              m.role === 'user' ? <div key={m.id} className={`${styles.bubble} ${styles.me}`} dir="auto">{m.text}</div>
                : m.role === 'agent' ? (
                  <div key={m.id} className={`${styles.bubble} ${styles.bot} ${styles.agent}`} dir="auto">
                    {m.author ? <span className={styles.author}>{m.author}</span> : null}
                    {m.text}
                  </div>
                )
                : m.role === 'notice' ? <p key={m.id} className={styles.notice} role="status">{m.text}</p>
                : m.role === 'error' ? (
                  <div key={m.id} className={styles.error} role="alert">
                    <span>{m.text}</span>
                    {m.retry ? <button type="button" onClick={() => void send(m.retry!)}>{t('Try again')}</button> : null}
                  </div>
                ) : <ReplyView key={m.id} reply={m.reply} busy={busy} latest={m.id === latestReply} onTrack={(orderNumber, contact) => void send({ action: 'track_order_form', orderNumber, contact, label: `${t('Order')} ${orderNumber}` })} />
            ))}
            {busy ? <div className={`${styles.bubble} ${styles.bot} ${styles.typing}`} aria-label={t('Typing…')}><span /><span /><span /></div> : null}
            {showSuggestions && suggestions.length ? (
              <div className={styles.chips}>
                {ended ? <button type="button" className={styles.chip} onClick={newChat}>{t('New chat')}</button> : null}
                {!ended && suggestions.map(s => <button type="button" key={`${s.label}-${s.action || s.message}`} className={styles.chip} onClick={() => pick(s)}>{lang === 'ar' ? s.labelAr || s.label : s.label}</button>)}
              </div>
            ) : null}
          </div>

          <form className={styles.compose} onSubmit={submit}>
            <textarea
              ref={input}
              value={draft}
              onChange={e => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              placeholder={t('Ask about products, delivery or your order…')}
              aria-label={t('Your message')}
              rows={1}
              maxLength={MAX_LENGTH}
              dir="auto"
              disabled={!!ended}
            />
            <button type="submit" className={styles.send} disabled={!draft.trim() || busy || !!ended} aria-label={t('Send')}><Send size={18} /></button>
          </form>
          <p className={styles.note}>{t('AI answers can make mistakes. Prices and stock are checked live.')}</p>
        </div>
      ) : null}
      <button
        ref={launcher}
        type="button"
        className={`${styles.launcher} ${tucked && !open ? styles.tucked : ''}`}
        onClick={() => { if (open) close(); else { setOpen(true); setUnread(false) } }}
        aria-expanded={open}
        aria-label={open ? t('Close chat') : unread ? t('Open chat: new reply') : t('Open shopping assistant')}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
        {unread && !open ? <span className={styles.unread} aria-hidden="true" /> : null}
      </button>
    </aside>
  )
}

function ReplyView({ reply, busy, latest, onTrack }: { reply: ChatReply; busy: boolean; latest: boolean; onTrack: (orderNumber: string, contact: string) => void }) {
  const { t } = useI18n()
  return (
    <div className={styles.reply}>
      {reply.text ? <div className={`${styles.bubble} ${styles.bot}`} dir="auto">{reply.text}</div> : null}
      {reply.products.length ? (
        <ul className={styles.cards}>
          {reply.products.map(p => (
            <li key={p.id}>
              <a href={p.url} className={styles.card}>
                {p.image ? <img src={p.image} alt="" loading="lazy" width={64} height={64} /> : <span className={styles.noImage} aria-hidden="true" />}
                <span className={styles.cardText}>
                  <strong dir="auto">{p.name}</strong>
                  <span className={styles.price}>
                    {money(p.price)}
                    {p.compareAtPrice ? <s>{money(p.compareAtPrice)}</s> : null}
                  </span>
                  <span className={p.stock === 'out_of_stock' ? styles.soldOut : styles.inStock}>
                    {p.stock === 'out_of_stock' ? t('Sold out') : p.stock === 'preorder' ? t('Pre-order') : t('In stock')}
                  </span>
                </span>
                <span className={styles.view}>{t('View')}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {reply.orders.length ? (
        <ul className={styles.orders}>
          {reply.orders.map(o => (
            <li key={o.orderNumber}>
              <span><strong>{o.orderNumber}</strong>{o.status ? ` · ${o.status}` : ''}</span>
              {o.link ? <a href={o.link}>{t('View order')}</a> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {reply.support ? (
        <div className={styles.support}>
          <p dir="auto">{reply.support.note}</p>
          <div>
            {reply.support.whatsapp ? <a href={reply.support.whatsapp} target="_blank" rel="noopener noreferrer" className={styles.whatsapp}>{t('WhatsApp us')}</a> : null}
            {reply.support.email ? <a href={`mailto:${reply.support.email}`} className={styles.email}>{t('Email us')}</a> : null}
          </div>
        </div>
      ) : null}
      {reply.form === 'track_order' && latest ? <TrackForm busy={busy} onSubmit={onTrack} /> : null}
    </div>
  )
}

function TrackForm({ busy, onSubmit }: { busy: boolean; onSubmit: (orderNumber: string, contact: string) => void }) {
  const { t } = useI18n()
  const [orderNumber, setOrderNumber] = useState('')
  const [contact, setContact] = useState('')
  const [id] = useState(uid)
  return (
    <form className={styles.track} onSubmit={e => { e.preventDefault(); if (orderNumber.trim() && contact.trim()) onSubmit(orderNumber.trim(), contact.trim()) }}>
      <label htmlFor={`${id}-n`}>{t('Order number')}</label>
      <input id={`${id}-n`} value={orderNumber} onChange={e => setOrderNumber(e.target.value)} maxLength={60} autoComplete="off" required />
      <label htmlFor={`${id}-c`}>{t('Phone number or email')}</label>
      <input id={`${id}-c`} value={contact} onChange={e => setContact(e.target.value)} maxLength={254} autoComplete="email" required />
      <button type="submit" disabled={busy || !orderNumber.trim() || !contact.trim()}>{t('Track order')}</button>
    </form>
  )
}
