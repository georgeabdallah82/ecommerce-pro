'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Cloud, Loader2, UploadCloud } from 'lucide-react'

export default function ThemePublishBar() {
  const [draft, setDraft] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/theme', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setDraft(Boolean(data.draft))
    } catch {}
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 2500)
    return () => window.clearInterval(timer)
  }, [refresh])

  const publish = async () => {
    if (!draft || publishing) return
    setPublishing(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/admin/theme/publish', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to publish theme')
      setDraft(false)
      setMessage('Published')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to publish theme')
      window.setTimeout(() => setError(''), 4000)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{position:'fixed',right:24,bottom:24,zIndex:9999,display:'flex',alignItems:'center',gap:12,padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:14,background:'#fff',boxShadow:'0 12px 36px rgba(0,0,0,.14)',fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,minWidth:145}}>
        {draft ? <><span style={{width:8,height:8,borderRadius:99,background:'#f59e0b'}}/><span style={{fontSize:13,fontWeight:600,color:'#374151'}}>Draft changes</span></> : <><Check size={15} color="#16a34a"/><span style={{fontSize:13,fontWeight:600,color:'#374151'}}>Published</span></>}
      </div>
      {message && <span style={{fontSize:12,color:'#16a34a'}}>{message}</span>}
      {error && <span style={{fontSize:12,color:'#dc2626',maxWidth:220}}>{error}</span>}
      <button onClick={publish} disabled={!draft || publishing} style={{display:'inline-flex',alignItems:'center',gap:7,border:0,borderRadius:10,padding:'9px 14px',background:draft?'#111827':'#e5e7eb',color:draft?'#fff':'#6b7280',fontSize:13,fontWeight:700,cursor:draft?'pointer':'default'}}>
        {publishing ? <Loader2 size={15} className="animate-spin"/> : draft ? <UploadCloud size={15}/> : <Cloud size={15}/>}
        {publishing ? 'Publishing…' : 'Publish'}
      </button>
    </div>
  )
}
