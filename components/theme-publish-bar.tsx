'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Cloud, Loader2, UploadCloud } from 'lucide-react'
import s from './admin-theme-publish-bar.module.css'

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
    <div className={s.bar}>
      <div className={s.status}>
        {draft ? <><span className={s.dot}/><span className={s.statusText}>Draft changes</span></> : <><Check size={15} className={s.publishedIcon}/><span className={s.statusText}>Published</span></>}
      </div>
      {message && <span className={s.message}>{message}</span>}
      {error && <span className={s.error}>{error}</span>}
      <button onClick={publish} disabled={!draft || publishing} className={`${s.publishBtn} ${draft ? s.draft : ''}`}>
        {publishing ? <Loader2 size={15} className="animate-spin"/> : draft ? <UploadCloud size={15}/> : <Cloud size={15}/>}
        {publishing ? 'Publishing…' : 'Publish'}
      </button>
    </div>
  )
}
