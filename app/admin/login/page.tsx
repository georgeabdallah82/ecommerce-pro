'use client'

import { FormEvent, useState } from 'react'

export default function AdminLoginPage(){
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false)
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const form=new FormData(e.currentTarget);try{const r=await fetch('/account/login',{method:'POST',body:form});if(!r.ok)throw new Error('Invalid admin credentials');window.location.href='/admin'}catch(err){setError(err instanceof Error?err.message:'Login failed')}finally{setBusy(false)}}
 return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24}}><form onSubmit={submit} className="card" style={{width:'100%',maxWidth:420,padding:24}}><h1>Admin sign in</h1><p className="muted">Staff access only.</p><label>Email<input className="input" name="email" type="email" required /></label><label>Password<input className="input" name="password" type="password" required /></label>{error&&<div className="alert danger">{error}</div>}<button className="btn" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></main>
}
