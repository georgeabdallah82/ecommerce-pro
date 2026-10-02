'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'

export type AdminLoginBrand = { name: string; logoUrl?: string; logoDarkUrl?: string; vars?: Record<string, string> }

export default function AdminLoginForm({ brand }: { brand?: AdminLoginBrand }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Invalid admin credentials')
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
      @media(max-width:820px){.adminLoginShell{grid-template-columns:1fr;max-width:480px}.adminLoginBrand{display:none}.adminLoginForm{padding:40px 30px}.adminLoginMobileLogo{display:block}}
      @media(max-width:420px){.adminLoginPage{padding:14px;align-items:start;padding-top:8vh}.adminLoginForm{padding:32px 22px}.adminLoginShell{border-radius:22px}}
    `}</style>
    <section className="adminLoginShell">
      <aside className="adminLoginBrand">
        <div style={{ position: 'relative' }}>
          {brand?.logoDarkUrl ? <img className="adminLoginLogo" src={brand.logoDarkUrl} alt={name} /> : <span className="adminLoginName">{name}</span>}
          <h2>Your store,<br /><em>in control.</em></h2>
          <p>Orders, products, customers and your storefront, all in one place.</p>
        </div>
        <div className="adminLoginFacts"><div className="adminLoginFact"><span />Live orders and sales</div><div className="adminLoginFact"><span />Theme studio for your storefront</div><div className="adminLoginFact"><span />Staff roles and activity log</div></div>
      </aside>
      <form onSubmit={submit} className="adminLoginForm">
        <div className="adminLoginMobileLogo">{brand?.logoUrl ? <img className="adminLoginLogo" src={brand.logoUrl} alt={name} /> : <span className="adminLoginName" style={{ color: '#191512' }}>{name}</span>}</div>
        <div className="adminLoginEyebrow">{name} admin</div><h1>Welcome back</h1><p>Sign in with your staff account to continue.</p>
        <div className="adminLoginFields"><label className="adminLoginLabel">Email<input className="adminLoginInput" name="email" type="email" autoComplete="username" placeholder="you@example.com" required/></label><label className="adminLoginLabel">Password<div className="adminLoginInputWrap"><input className="adminLoginInput" name="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" required/><button type="button" className="adminLoginPasswordToggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label></div>
        {error&&<div className="adminLoginAlert" role="alert">{error}</div>}
        <button className="adminLoginSubmit" disabled={busy}>{busy?'Signing in…':'Sign in'}{!busy&&<ArrowRight size={15}/>}</button>
        <div className="adminLoginFoot">Staff access only · Customers sign in on the store.</div>
      </form>
    </section>
  </main>
}
