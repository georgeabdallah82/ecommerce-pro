'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'

export default function AdminLoginForm() {
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

  return <main className="adminLoginPage">
    <style jsx>{`
      .adminLoginPage{min-height:100vh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 15% 10%,rgba(49,166,106,.11),transparent 30%),radial-gradient(circle at 90% 90%,rgba(23,23,23,.07),transparent 30%),#f5f5f2}
      .adminLoginShell{width:min(980px,100%);display:grid;grid-template-columns:1fr 430px;overflow:hidden;border:1px solid #e1e1db;border-radius:26px;background:#fff;box-shadow:0 30px 90px rgba(20,20,18,.13)}
      .adminLoginBrand{padding:52px;background:linear-gradient(145deg,#171817,#2c312d);color:#fff;display:flex;flex-direction:column;justify-content:space-between;min-height:560px}.adminLoginBrandTop{display:flex;align-items:center;gap:11px}.adminLoginBrandMark{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15)}.adminLoginBrand h2{margin:52px 0 10px;font-size:42px;line-height:1.02;letter-spacing:-.05em;color:#fff}.adminLoginBrand p{max-width:330px;margin:0;color:rgba(255,255,255,.67);font-size:14px;line-height:1.7}.adminLoginFacts{display:grid;gap:10px}.adminLoginFact{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.78);font-size:11px}.adminLoginFact span{width:7px;height:7px;border-radius:50%;background:#6fd99b;box-shadow:0 0 0 4px rgba(111,217,155,.12)}
      .adminLoginForm{padding:52px 42px;display:flex;flex-direction:column;justify-content:center}.adminLoginEyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:#77776f}.adminLoginForm h1{margin:8px 0 6px;font-size:30px;letter-spacing:-.04em}.adminLoginForm>p{margin:0;color:#77776f;font-size:13px;line-height:1.55}.adminLoginFields{display:grid;gap:16px;margin-top:28px}.adminLoginLabel{display:grid;gap:7px;font-size:11px;font-weight:850;color:#3f3f3a}.adminLoginInputWrap{position:relative}.adminLoginInput{width:100%;height:46px;padding:0 44px 0 13px;border:1px solid #dcdcd6;border-radius:11px;background:#fbfbf8;color:#222;outline:none;font-size:13px}.adminLoginInput:focus{background:#fff;border-color:#85857d;box-shadow:0 0 0 3px rgba(23,23,23,.06)}.adminLoginPasswordToggle{position:absolute;right:7px;top:6px;width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#77776f;display:grid;place-items:center;cursor:pointer}.adminLoginPasswordToggle:hover{background:#f0f0eb;color:#222}.adminLoginAlert{margin-top:16px;padding:11px 12px;border:1px solid #f0c7c2;border-radius:11px;background:#fff3f2;color:#972d24;font-size:12px;line-height:1.5}.adminLoginSubmit{height:46px;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid #171817;border-radius:11px;background:#171817;color:#fff;font-size:13px;font-weight:850;cursor:pointer;box-shadow:0 8px 20px rgba(23,23,23,.12);transition:.16s ease}.adminLoginSubmit:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 28px rgba(23,23,23,.17)}.adminLoginSubmit:disabled{opacity:.55;cursor:not-allowed}.adminLoginFoot{margin-top:18px;text-align:center;color:#909089;font-size:10px}
      @media(max-width:820px){.adminLoginShell{grid-template-columns:1fr;max-width:520px}.adminLoginBrand{display:none}.adminLoginForm{padding:42px 30px}}
      @media(max-width:420px){.adminLoginPage{padding:14px}.adminLoginForm{padding:34px 22px}.adminLoginShell{border-radius:20px}}
      html[data-admin-theme='dark'] .adminLoginPage{background:#0f1210;color:#eef3ef}
      /* .adminLoginShell/.adminLoginEyebrow used to be appended here as bare,
         unscoped rules (no html[data-admin-theme='dark'] prefix), so they applied
         unconditionally in every theme -- .adminLoginEyebrow's intended dark color
         clobbered the correct light-mode value in light mode too. Properly scoped
         below, plus dark coverage added for every other classname on this page
         that previously had none at all. */
      html[data-admin-theme='dark'] .adminLoginShell{background:#191d1b;border-color:#2c332e;box-shadow:0 30px 90px rgba(0,0,0,.45)}
      html[data-admin-theme='dark'] .adminLoginEyebrow{color:#9da69f}
      html[data-admin-theme='dark'] .adminLoginForm>p{color:#9da69f}
      html[data-admin-theme='dark'] .adminLoginLabel{color:#dce3de}
      html[data-admin-theme='dark'] .adminLoginInput{border-color:#343b36;background:#191d1b;color:#eef2ef}
      html[data-admin-theme='dark'] .adminLoginInput:focus{background:#1f2422;border-color:#4fd18b;box-shadow:0 0 0 3px rgba(79,209,139,.15)}
      html[data-admin-theme='dark'] .adminLoginPasswordToggle{color:#9da69f}
      html[data-admin-theme='dark'] .adminLoginPasswordToggle:hover{background:#2c332e;color:#eef2ef}
      html[data-admin-theme='dark'] .adminLoginAlert{border-color:#4a2620;background:#33201c;color:#f0776a}
      html[data-admin-theme='dark'] .adminLoginFoot{color:#9ba49e}
    `}</style>
    <section className="adminLoginShell">
      <aside className="adminLoginBrand"><div><div className="adminLoginBrandTop"><div className="adminLoginBrandMark"><ShieldCheck size={20}/></div><strong>Control Center</strong></div><h2>Run your store with confidence.</h2><p>Secure staff access to orders, catalog, inventory, customers, content and analytics.</p></div><div className="adminLoginFacts"><div className="adminLoginFact"><span/>Permission-based access</div><div className="adminLoginFact"><span/>Auditable store operations</div><div className="adminLoginFact"><span/>Live analytics workspace</div></div></aside>
      <form onSubmit={submit} className="adminLoginForm">
        <div className="adminLoginEyebrow">Store operations</div><h1>Welcome back</h1><p>Sign in with your staff account to continue.</p>
        <div className="adminLoginFields"><label className="adminLoginLabel">Email<input className="adminLoginInput" name="email" type="email" autoComplete="username" placeholder="you@example.com" required/></label><label className="adminLoginLabel">Password<div className="adminLoginInputWrap"><input className="adminLoginInput" name="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" required/><button type="button" className="adminLoginPasswordToggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label></div>
        {error&&<div className="adminLoginAlert">{error}</div>}
        <button className="adminLoginSubmit" disabled={busy}>{busy?'Signing in…':'Sign in'}{!busy&&<ArrowRight size={15}/>}</button>
        <div className="adminLoginFoot">Staff access only · Customer accounts use the storefront account flow.</div>
      </form>
    </section>
  </main>
}
