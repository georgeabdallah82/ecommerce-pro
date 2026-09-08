import Link from 'next/link'
import { login } from './server'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const invalid = params.error === 'invalid'
  const rateLimited = params.error === 'rate-limited'

  return (
    <main className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <span className="muted">ACCOUNT</span>
        <h1 className="h2" style={{ fontSize: 46, marginTop: 10 }}>Sign in</h1>
        <p className="muted">Access your account and, for authorized staff, the Control Center.</p>
        {invalid && <div className="alert danger" style={{ marginTop: 18 }}>Invalid email or password. Please try again.</div>}
        {rateLimited && <div className="alert danger" style={{ marginTop: 18 }}>Too many sign-in attempts. Please wait a few minutes and try again.</div>}
        <form action={login} className="card" style={{ padding: 24, marginTop: 20 }}>
          <label className="fieldLabel" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          <label className="fieldLabel" htmlFor="password" style={{ marginTop: 14 }}>Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" placeholder="Password" required />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Link href="/account/forgot-password" className="muted" style={{ textDecoration: 'underline' }}>Forgot password?</Link>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: 16 }}>Sign in</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>New here? <Link href="/account/register" style={{ textDecoration: 'underline' }}>Create an account</Link></p>
      </div>
    </main>
  )
}
