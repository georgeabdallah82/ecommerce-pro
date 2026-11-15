'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import styles from './admin-settings-center.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

type Status = { enabled: boolean; enabledAt?: string | null; backupLeft: number }
type Setup = { secret: string; uri: string; account: string; issuer: string }

const AUTHENTICATOR_APP = 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2'

async function api(path: string, body?: unknown) {
  const r = await fetchRead(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// The QR code authenticator apps scan (on a computer; on the phone itself, the link opens the app).
export function QrCode({ text }: { text: string }) {
  const [path, setPath] = useState<{ d: string; size: number } | null>(null)
  useEffect(() => {
    let active = true
    import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M')
      qr.addData(text)
      qr.make()
      const n = qr.getModuleCount()
      let d = ''
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4},${r + 4}h1v1h-1z`
      if (active) setPath({ d, size: n + 8 })
    }).catch(() => {})
    return () => { active = false }
  }, [text])
  if (!path) return null
  return <svg viewBox={`0 0 ${path.size} ${path.size}`} width={180} height={180} role="img" aria-label="QR code for the authenticator app" style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--admin-border)' }} shapeRendering="crispEdges"><path d={path.d} fill="#000" /></svg>
}

// Settings > Security & access: 2-step login for your own account (lib/two-step.ts).
export default function TwoStepCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [asking, setAsking] = useState<'' | 'off' | 'backup-codes'>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => { api('/api/admin/two-step').then(setStatus).catch(e => setError(e instanceof Error ? e.message : 'Could not load')) }, [])

  async function run(body: Record<string, unknown>, after: (d: Record<string, unknown>) => void) {
    setBusy(true); setError(''); setMsg('')
    try { after(await api('/api/admin/two-step', body)) } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') } finally { setBusy(false) }
  }
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500) } catch {} }
  const download = () => {
    const blob = new Blob([`Backup codes for the store admin (2-step login)\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'admin-backup-codes.txt'; a.click(); URL.revokeObjectURL(a.href)
  }
  const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

  return <section className={`${ui.card} ${styles.card}`}>
    <header className={styles.cardHead}><div>
      <h2>2-step login</h2>
      <p className={ui.muted}>After your password, the admin also asks for a 6-digit code from an app on your phone. If someone learns your password, they still can&apos;t get in. This is for your own account; each staff member turns it on for themselves.</p>
    </div></header>
    <div className={styles.cardBody}>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    {msg && <div className={ui.alert} role="status">{msg}</div>}

    {codes.length > 0 && <div className={ui.alert} style={{ display: 'grid', gap: 10 }}>
      <strong><KeyRound size={15} style={{ verticalAlign: '-2px' }} /> Your backup codes</strong>
      <span>If you lose your phone, each of these lets you sign in once. Keep them somewhere safe that is not this phone: print them, or write them on paper. They are shown only now.</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 15 }}>{codes.map(c => <span key={c}>{c}</span>)}</div>
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => copy('codes', codes.join('\n'))}>{copied === 'codes' ? <Check size={15} /> : <Copy size={15} />} {copied === 'codes' ? 'Copied' : 'Copy them'}</button>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={download}><Download size={15} /> Download</button>
        <button type="button" className={ui.btn} onClick={() => setCodes([])}>I saved them</button>
      </div>
    </div>}

    {status === null ? <p className={ui.muted}>Loading…</p>
      : status.enabled ? <div style={{ display: 'grid', gap: 12 }}>
        <p><span className={`${ui.statusPill} ${ui.statusPillSuccess}`}><ShieldCheck size={12} /> On</span> <span className={ui.muted}>{status.enabledAt ? `since ${new Date(status.enabledAt).toLocaleDateString()} · ` : ''}{status.backupLeft} backup code{status.backupLeft === 1 ? '' : 's'} left</span></p>
        {asking ? <form className="inline" style={{ gap: 8, flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); run({ action: asking, code }, d => {
          if (asking === 'off') { setStatus({ enabled: false, backupLeft: 0 }); setMsg('2-step login is off. You sign in with your password only.') }
          else { setCodes((d.backupCodes as string[]) || []); setStatus(s => s && { ...s, backupLeft: ((d.backupCodes as string[]) || []).length }); setMsg('New backup codes made. The old ones no longer work.') }
          setAsking(''); setCode('')
        }) }}>
          <input className={ui.input} style={{ maxWidth: 180 }} value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="Code from the app" aria-label="Code from the app" autoFocus />
          <button type="submit" className={asking === 'off' ? `${ui.btn} ${ui.btnDanger}` : ui.btn} disabled={busy || !code.trim()}>{asking === 'off' ? 'Turn it off' : 'Make new codes'}</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setAsking(''); setCode('') }}>Cancel</button>
        </form> : <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAsking('backup-codes')}>New backup codes</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAsking('off')}>Turn off</button>
        </div>}
      </div>
      : setup ? <div style={{ display: 'grid', gap: 14 }}>
        <div><strong>1. Install the app</strong><p className={ui.muted}>On your phone, install <a className={ui.textLink} href={AUTHENTICATOR_APP} target="_blank" rel="noreferrer">Google Authenticator</a> (free). Microsoft Authenticator or any other authenticator app also works.</p></div>
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>2. Add the store to the app</strong>
          <p className={ui.muted}><b>On this phone:</b> tap the button, then tap Add or Save in the app.</p>
          <a className={ui.btn} href={setup.uri} style={{ justifySelf: 'start' }}><Smartphone size={16} /> Open in the authenticator app</a>
          <p className={ui.muted}><b>On a computer:</b> in the app, tap <b>+</b> then <b>Scan a QR code</b>, and point the phone at this code.</p>
          <QrCode text={setup.uri} />
          <p className={ui.muted}><b>Or type the key:</b> in the app, tap <b>+</b> then <b>Enter a setup key</b>. Account: {setup.account}. Key:</p>
          <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}><code style={{ fontSize: 15, letterSpacing: '.04em' }}>{grouped(setup.secret)}</code><button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => copy('key', setup.secret)}>{copied === 'key' ? <Check size={13} /> : <Copy size={13} />} {copied === 'key' ? 'Copied' : 'Copy key'}</button></div>
        </div>
        <form style={{ display: 'grid', gap: 8 }} onSubmit={e => { e.preventDefault(); run({ action: 'confirm', code }, d => { setCodes((d.backupCodes as string[]) || []); setStatus({ enabled: true, enabledAt: new Date().toISOString(), backupLeft: ((d.backupCodes as string[]) || []).length }); setSetup(null); setCode(''); setMsg('2-step login is on. Other devices were signed out; sign in there again with a code.') }) }}>
          <strong>3. Type the 6-digit code the app shows</strong>
          <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className={ui.input} style={{ maxWidth: 180 }} value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="6-digit code" />
            <button type="submit" className={ui.btn} disabled={busy || !code.trim()}><ShieldCheck size={16} /> Turn on</button>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setSetup(null); setCode('') }}>Cancel</button>
          </div>
        </form>
      </div>
      : <div style={{ display: 'grid', gap: 10 }}>
        <p><span className={ui.statusPill}>Off</span></p>
        <button type="button" className={ui.btn} style={{ justifySelf: 'start' }} disabled={busy} onClick={() => run({ action: 'start' }, d => setSetup(d as unknown as Setup))}><ShieldCheck size={16} /> Turn on 2-step login</button>
      </div>}
    </div>
  </section>
}
