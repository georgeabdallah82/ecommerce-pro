'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { QrCode } from '@/components/two-step-card'

export type AdminLoginBrand = { name: string; logoUrl?: string; logoDarkUrl?: string; vars?: Record<string, string> }

export default function AdminLoginForm({ brand }: { brand?: AdminLoginBrand }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // 2-step login (lib/two-step.ts): after a right password, the code from the phone's app.
  const [codeStep, setCodeStep] = useState(false)
  const [useBackup, setUseBackup] = useState(false)
  const [code, setCode] = useState('')
  // Staff without 2-step login set it up here before they get in (app/api/admin/login/enroll).
  const [enrollStep, setEnrollStep] = useState(false)
  const [enrollSetup, setEnrollSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  async function loadEnrollment() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/login/enroll', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to start 2-step login set-up')
      setEnrollSetup({ secret: data.secret, uri: data.uri })
      setEnrollStep(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to start 2-step login set-up') }
    finally { setBusy(false) }
  }

  async function submitEnroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/login/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: enrollCode }) })
      const data = await response.json().catch(() => ({}))
      if (data.restart) { setEnrollStep(false); setEnrollSetup(null); setEnrollCode(''); throw new Error(data.error) }
      if (!response.ok) throw new Error(data.error || 'That code is not right')
      setBackupCodes(data.backupCodes || [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to turn on 2-step login'); setBusy(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Invalid admin credentials')
      if (data.needsCode) { setCodeStep(true); setBusy(false); return }
      if (data.needsEnrollment) { setBusy(false); await loadEnrollment(); return }
      window.location.assign('/admin')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in'); setBusy(false) }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/login/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
      const data = await response.json().catch(() => ({}))
      if (data.restart) { setCodeStep(false); setCode(''); setUseBackup(false) }
      if (!response.ok) throw new Error(data.error || 'That code is not right')
      if (typeof data.backupLeft === 'number') window.alert(`Signed in with a backup code. ${data.backupLeft} backup code${data.backupLeft === 1 ? '' : 's'} left. Make new ones in Settings > Security & access.`)
      window.location.assign('/admin')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in'); setBusy(false) }
  }

  const name = brand?.name || 'Control Center'
  return <main className="adminLoginPage" style={brand?.vars as React.CSSProperties}>
    <style jsx>{`
      .adminLoginPage{--accent:var(--login-accent,#d42a2a);--accent-ink:var(--login-accent-ink,#fff);--panel:var(--login-panel,#191512);min-height:100vh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 12% 8%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 32%),radial-gradient(circle at 92% 92%,rgba(25,21,18,.06),transparent 30%),var(--login-bg,#f7f3ef)}
      .adminLoginShell{width:min(980px,100%);display:grid;grid-template-columns:1fr 430px;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 1px 2px rgba(25,21,18,.05),0 30px 90px rgba(120,20,10,.12)}
      .adminLoginBrand{position:relative;overflow:hidden;padding:48px;background:var(--panel);color:#fff;display:flex;flex-direction:column;justify-content:space-between;min-height:560px}
      .adminLoginBrand::after{content:'';position:absolute;right:-120px;bottom:-140px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 55%,transparent),transparent 70%);opacity:.55}
      .adminLoginLogo{height:34px;width:auto;max-width:220px;object-fit:contain;display:block}.adminLoginName{font-size:20px;font-weight:900;letter-spacing:-.03em}
      .adminLoginBrand h2{position:relative;margin:56px 0 12px;font-size:42px;line-height:1.04;letter-spacing:-.05em;color:#fff}.adminLoginBrand h2 em{font-style:normal;color:var(--accent)}
      .adminLoginBrand p{position:relative;max-width:330px;margin:0;color:rgba(255,255,255,.68);font-size:14px;line-height:1.7}
      .adminLoginFacts{position:relative;display:grid;gap:11px}.adminLoginFact{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.8);font-size:12px}.adminLoginFact span{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 25%,transparent)}
      .adminLoginForm{padding:52px 42px;display:flex;flex-direction:column;justify-content:center}.adminLoginMobileLogo{display:none;margin-bottom:26px}
      .adminLoginEyebrow{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:#746b64}.adminLoginForm h1{margin:8px 0 6px;font-size:30px;letter-spacing:-.04em;color:#191512}.adminLoginForm>p{margin:0;color:#746b64;font-size:13px;line-height:1.55}
      .adminLoginFields{display:grid;gap:16px;margin-top:28px}.adminLoginLabel{display:grid;gap:7px;font-size:11.5px;font-weight:800;color:#3d3833}.adminLoginInputWrap{position:relative}
      .adminLoginInput{width:100%;height:48px;padding:0 44px 0 14px;border:1px solid #eaded4;border-radius:12px;background:#fffaf6;color:#191512;outline:none;font-size:14px}.adminLoginInput:focus{background:#fff;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
      .adminLoginPasswordToggle{position:absolute;right:7px;top:7px;width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#746b64;display:grid;place-items:center;cursor:pointer}.adminLoginPasswordToggle:hover{background:#f3ede7;color:#191512}
      .adminLoginAlert{position:relative;margin-top:16px;padding:11px 12px 11px 40px;border:1px solid #f1c9c4;border-left:3px solid #c1372a;border-radius:11px;background:#fdecea;color:#972d24;font-size:12.5px;line-height:1.5}.adminLoginAlert::before{content:'!';position:absolute;left:12px;top:11px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#c1372a;color:#fff;font-size:11px;font-weight:900}
      .adminLoginSubmit{height:48px;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:12px;background:var(--accent);color:var(--accent-ink);font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 28%,transparent);transition:.16s ease}.adminLoginSubmit:hover:not(:disabled){transform:translateY(-1px);filter:brightness(.96)}.adminLoginSubmit:disabled{opacity:.55;cursor:not-allowed}
      .adminLoginFoot{margin-top:18px;text-align:center;color:#8d8178;font-size:11px}
      .adminLoginLink{margin-top:12px;border:0;background:transparent;color:#5b524b;font-size:12.5px;font-weight:700;text-decoration:underline;cursor:pointer;align-self:center}
      @media(max-width:820px){.adminLoginShell{grid-template-columns:1fr;max-width:480px}.adminLoginBrand{display:none}.adminLoginForm{padding:40px 30px}.adminLoginMobileLogo{display:block}}
      @media(max-width:420px){.adminLoginPage{padding:14px;align-items:start;padding-top:8vh}.adminLoginForm{padding:32px 22px}.adminLoginShell{border-radius:22px}}
    `}</style>
    <section className="adminLoginShell">
      <aside className="adminLoginBrand">
        <div style={{ position: 'relative' }}>
          {brand?.logoUrl ? <img className="adminLoginLogo" src={brand.logoUrl} alt={name} /> : <span className="adminLoginName">{name}</span>}
          <h2>Your store,<br /><em>in control.</em></h2>
          <p>Orders, products, customers and your storefront, all in one place.</p>
        </div>
        <div className="adminLoginFacts"><div className="adminLoginFact"><span />Live orders and sales</div><div className="adminLoginFact"><span />Theme studio for your storefront</div><div className="adminLoginFact"><span />Staff roles and activity log</div></div>
      </aside>
      {enrollStep ? <form onSubmit={submitEnroll} className="adminLoginForm">
        <div className="adminLoginMobileLogo">{brand?.logoUrl ? <img className="adminLoginLogo" src={brand.logoUrl} alt={name} /> : <span className="adminLoginName" style={{ color: '#191512' }}>{name}</span>}</div>
        <div className="adminLoginEyebrow">Required for staff</div><h1>Set up 2-step login</h1>
        {backupCodes ? <>
          <p>Save these backup codes somewhere safe. Each one works once if you lose your phone. They are shown only now.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: '12px 0' }}>{backupCodes.map(c => <code key={c} style={{ padding: '6px 8px', background: '#f6f1ec', borderRadius: 6, textAlign: 'center' }}>{c}</code>)}</div>
          <button type="button" className="adminLoginSubmit" onClick={() => window.location.assign('/admin')}>I saved them, continue</button>
        </> : enrollSetup ? <>
          <p>Install an authenticator app (for example Google Authenticator), then scan this code with it.</p>
          <div style={{ margin: '12px 0' }}><QrCode text={enrollSetup.uri} /></div>
          <p>Can&apos;t scan it? Type this key into the app: <code style={{ wordBreak: 'break-all' }}>{enrollSetup.secret}</code></p>
          <div className="adminLoginFields"><label className="adminLoginLabel">6-digit code from the app<input className="adminLoginInput" name="code" value={enrollCode} onChange={e => setEnrollCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label></div>
          {error&&<div className="adminLoginAlert" role="alert">{error}</div>}
          <button className="adminLoginSubmit" disabled={busy || !enrollCode.trim()}>{busy?'Checking…':'Turn on and continue'}{!busy&&<ArrowRight size={15}/>}</button>
        </> : <p>{error || 'Loading…'}</p>}
      </form> : codeStep ? <form onSubmit={submitCode} className="adminLoginForm">
        <div className="adminLoginMobileLogo">{brand?.logoUrl ? <img className="adminLoginLogo" src={brand.logoUrl} alt={name} /> : <span className="adminLoginName" style={{ color: '#191512' }}>{name}</span>}</div>
        <div className="adminLoginEyebrow">2-step login</div><h1>Enter your code</h1>
        <p>{useBackup ? 'Type one of the backup codes you saved when you turned on 2-step login. Each one works once.' : 'Open your authenticator app (for example Google Authenticator) and type the 6-digit code it shows for this store.'}</p>
        <div className="adminLoginFields"><label className="adminLoginLabel">{useBackup ? 'Backup code' : '6-digit code'}<input className="adminLoginInput" name="code" value={code} onChange={e => setCode(e.target.value)} inputMode={useBackup ? 'text' : 'numeric'} autoComplete="one-time-code" placeholder={useBackup ? 'abcd-2345' : '123456'} maxLength={useBackup ? 12 : 7} autoFocus required/></label></div>
        {error&&<div className="adminLoginAlert" role="alert">{error}</div>}
        <button className="adminLoginSubmit" disabled={busy || !code.trim()}>{busy?'Checking…':'Sign in'}{!busy&&<ArrowRight size={15}/>}</button>
        <button type="button" className="adminLoginLink" onClick={() => { setUseBackup(v => !v); setCode(''); setError('') }}>{useBackup ? 'Use the code from the app' : 'Lost your phone? Use a backup code'}</button>
        <button type="button" className="adminLoginLink" onClick={() => { setCodeStep(false); setCode(''); setError(''); setUseBackup(false) }}>Back</button>
      </form> : <form onSubmit={submit} className="adminLoginForm">
        <div className="adminLoginMobileLogo">{brand?.logoUrl ? <img className="adminLoginLogo" src={brand.logoUrl} alt={name} /> : <span className="adminLoginName" style={{ color: '#191512' }}>{name}</span>}</div>
        <div className="adminLoginEyebrow">{name} admin</div><h1>Welcome back</h1><p>Sign in with your staff account to continue.</p>
        <div className="adminLoginFields"><label className="adminLoginLabel">Email<input className="adminLoginInput" name="email" type="email" autoComplete="username" placeholder="you@example.com" required/></label><label className="adminLoginLabel">Password<div className="adminLoginInputWrap"><input className="adminLoginInput" name="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" required/><button type="button" className="adminLoginPasswordToggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label></div>
        {error&&<div className="adminLoginAlert" role="alert">{error}</div>}
        <button className="adminLoginSubmit" disabled={busy}>{busy?'Signing in…':'Sign in'}{!busy&&<ArrowRight size={15}/>}</button>
        <div className="adminLoginFoot">Staff access only · Customers sign in on the store.</div>
      </form>}
    </section>
  </main>
}
