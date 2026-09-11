'use client'

import { Check, Cloud, Loader2, UploadCloud } from 'lucide-react'
import s from './admin-theme-publish-bar.module.css'

// Purely presentational -- the theme editor (components/focal-theme-editor.tsx)
// owns the draft/publishing state and passes it in. It always knows the
// instant a draft is saved or published, so there's no need for this bar to
// poll the server itself to find out.
type Props = { draft: boolean; publishing: boolean; message: string; error: string; onPublish: () => void }

export default function ThemePublishBar({ draft, publishing, message, error, onPublish }: Props) {
  return (
    <div className={s.bar}>
      <div className={s.status}>
        {draft ? <><span className={s.dot}/><span className={s.statusText}>Draft changes</span></> : <><Check size={15} className={s.publishedIcon}/><span className={s.statusText}>Published</span></>}
      </div>
      {message && <span className={s.message}>{message}</span>}
      {error && <span className={s.error}>{error}</span>}
      <button onClick={onPublish} disabled={!draft || publishing} className={`${s.publishBtn} ${draft ? s.draft : ''}`}>
        {publishing ? <Loader2 size={15} className="animate-spin"/> : draft ? <UploadCloud size={15}/> : <Cloud size={15}/>}
        {publishing ? 'Publishing…' : 'Publish'}
      </button>
    </div>
  )
}
