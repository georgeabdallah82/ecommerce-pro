import Link from 'next/link'
export default function AdminNotFound(){return <div className="card adminPanel"><span className="muted">404</span><h1 className="h2">Admin resource not found.</h1><p className="muted">The requested record or control-center page doesn't exist.</p><Link className="btn" href="/admin">Back to dashboard</Link></div>}
