'use client'

import { useMemo, useState } from 'react'

type Customer = { id: string; name: string; email: string }

type Props = { customers: Customer[]; recent: Array<{ id: string; title: string; body: string; createdAt: string }> }

export default function CustomerNotificationCenter({ customers, recent }: Props) {
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('/')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? customers.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(q)) : customers
  }, [customers, query])

  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }

  async function send() {
    setBusy(true); setResult('')
    try {
      const response = await fetch('/api/admin/notifications/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, message, url, audience, customerIds: audience === 'selected' ? selected : undefined }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to send notification')
      setResult(`Sent to ${data.sent} subscribed device${data.sent === 1 ? '' : 's'}. ${data.requestedCustomers} eligible customer account${data.requestedCustomers === 1 ? '' : 's'} were targeted.`)
      setTitle(''); setMessage(''); setUrl('/'); setSelected([])
    } catch (e) { setResult(e instanceof Error ? e.message : 'Unable to send notification') }
    finally { setBusy(false) }
  }

  return <div className="grid" style={{ gap: 18 }}>
    <section className="card" style={{ padding: 22 }}>
      <div className="sectionHead small"><div><span className="muted">MARKETING PUSH</span><h2 className="h2" style={{ fontSize: 32 }}>Customer notifications</h2><p className="muted">Send deals, launches and custom messages to customers who opted in on their devices.</p></div><span className="pill">{customers.length} active customers</span></div>
      <div className="grid twoColumn" style={{ gap: 14 }}>
        <label><span className="muted">Title</span><input className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekend deal 🔥" /></label>
        <label><span className="muted">Action URL</span><input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="/collections/weekend-deals" /></label>
      </div>
      <label style={{ display: 'grid', gap: 5, marginTop: 14 }}><span className="muted">Message</span><textarea className="textarea" maxLength={240} rows={4} value={message} onChange={e => setMessage(e.target.value)} placeholder="Get 20% off selected products today." /><span className="muted" style={{ fontSize: 11 }}>{message.length}/240</span></label>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className={`btn ${audience === 'all' ? '' : 'secondary'}`} onClick={() => setAudience('all')}>All opted-in customers</button>
        <button type="button" className={`btn ${audience === 'selected' ? '' : 'secondary'}`} onClick={() => setAudience('selected')}>Selected customers ({selected.length})</button>
      </div>
      {audience === 'selected' && <div style={{ marginTop: 14 }}><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customers…" /><div style={{ maxHeight: 260, overflow: 'auto', display: 'grid', gap: 6, marginTop: 10 }}>{filtered.map(customer => <label key={customer.id} className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}><input type="checkbox" checked={selected.includes(customer.id)} onChange={() => toggle(customer.id)} /><span><strong>{customer.name}</strong><span className="muted" style={{ display: 'block', fontSize: 12 }}>{customer.email}</span></span></label>)}</div></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}><button className="btn" type="button" disabled={busy || !title.trim() || !message.trim() || (audience === 'selected' && !selected.length)} onClick={send}>{busy ? 'Sending…' : 'Send notification'}</button>{result && <span className="muted">{result}</span>}</div>
    </section>
    <section className="card" style={{ padding: 22 }}><div className="sectionHead small"><div><span className="muted">HISTORY</span><h3>Recent customer notifications</h3></div></div>{!recent.length ? <p className="muted">No customer notifications sent yet.</p> : <div className="grid" style={{ gap: 8 }}>{recent.map(item => <div key={item.id} style={{ padding: 12, border: '1px solid #ecece7', borderRadius: 10 }}><strong>{item.title}</strong><p className="muted" style={{ margin: '4px 0' }}>{item.body}</p><span className="muted" style={{ fontSize: 11 }}>{new Date(item.createdAt).toLocaleString()}</span></div>)}</div>}</section>
  </div>
}
