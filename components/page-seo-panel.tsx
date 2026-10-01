'use client'

import { useEffect, useState } from 'react'

export type SeoPageRow = { id: string; title: string; handle: string; status: string; seoTitle?: string | null; seoDescription?: string | null; bodyHtml?: string | null }

const TITLE_MAX = 60
const DESC_MAX = 160
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

// "Page details & search listing" for the theme studio's Pages tab: the page's name, its
// URL and what Google shows for it, with a live preview of that listing. These belong to
// the page itself rather than the theme, so they save straight to /api/admin/pages (not
// into the theme draft) -- the panel says so, to avoid a merchant waiting to "publish" them.
export default function PageSeoPanel({ page, onSaved }: { page: SeoPageRow; onSaved: (row: SeoPageRow) => void }) {
  const [title, setTitle] = useState(page.title)
  const [handle, setHandle] = useState(page.handle)
  const [seoTitle, setSeoTitle] = useState(page.seoTitle || '')
  const [seoDescription, setSeoDescription] = useState(page.seoDescription || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setTitle(page.title); setHandle(page.handle); setSeoTitle(page.seoTitle || ''); setSeoDescription(page.seoDescription || '')
    setError(''); setSaved(false)
  }, [page.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cleanHandle = slugify(handle)
  const dirty = title !== page.title || cleanHandle !== page.handle || seoTitle !== (page.seoTitle || '') || seoDescription !== (page.seoDescription || '')
  const handleChangesLiveUrl = page.status === 'PUBLISHED' && cleanHandle !== page.handle
  const host = typeof window === 'undefined' ? 'yourstore.com' : window.location.host
  const shownTitle = (seoTitle || title || 'Page title').trim()
  const shownDescription = (seoDescription || '').trim()

  async function save() {
    if (!dirty || busy) return
    setBusy(true); setError(''); setSaved(false)
    try {
      const response = await fetch('/api/admin/pages', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: page.id, title, handle: cleanHandle, seoTitle, seoDescription }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save page details')
      onSaved({ ...page, ...data.page })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save page details')
    } finally { setBusy(false) }
  }

  return (
    <details className="pageSeo">
      <summary>Page details &amp; search listing</summary>
      <div className="pageSeoBody">
        <label>Page name<input value={title} onChange={event => { setTitle(event.target.value); setSaved(false) }} maxLength={200} /></label>
        <label>URL<span className="pageSeoUrl"><i>/</i><input value={handle} onChange={event => { setHandle(event.target.value); setSaved(false) }} maxLength={200} aria-label="Page URL" /></span></label>
        {handleChangesLiveUrl && <small className="pageSeoWarn">This page is visible. Changing its URL breaks links already shared to /{page.handle}.</small>}
        <label>Search title<input value={seoTitle} onChange={event => { setSeoTitle(event.target.value); setSaved(false) }} placeholder={title} maxLength={200} />
          <small className={seoTitle.length > TITLE_MAX ? 'pageSeoWarn' : ''}>{seoTitle.length}/{TITLE_MAX} — leave empty to use the page name</small></label>
        <label>Search description<textarea value={seoDescription} onChange={event => { setSeoDescription(event.target.value); setSaved(false) }} rows={3} maxLength={500} placeholder="One or two sentences that make people want to click." />
          <small className={seoDescription.length > DESC_MAX ? 'pageSeoWarn' : ''}>{seoDescription.length}/{DESC_MAX}</small></label>
        <div className="pageSeoSnippet" aria-label="Search result preview">
          <span>{host}/{cleanHandle || page.handle}</span>
          <strong>{shownTitle.length > TITLE_MAX ? shownTitle.slice(0, TITLE_MAX - 1) + '…' : shownTitle}</strong>
          <p>{shownDescription ? (shownDescription.length > DESC_MAX ? shownDescription.slice(0, DESC_MAX - 1) + '…' : shownDescription) : 'No description yet. Search engines will pick text from the page.'}</p>
        </div>
        {error && <small className="pageSeoWarn" role="alert">{error}</small>}
        <div className="pageSeoActions">
          <button type="button" onClick={save} disabled={!dirty || busy || !title.trim() || !cleanHandle}>{busy ? 'Saving…' : 'Save details'}</button>
          {saved && <small>Saved. These apply right away; they don&rsquo;t need publishing.</small>}
        </div>
      </div>
    </details>
  )
}
