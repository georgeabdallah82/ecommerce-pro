'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pilcrow, Redo2, Undo2 } from 'lucide-react'
import s from './rich-text-editor.module.css'

// A small word-processor style editor for long text (policies): headings, bold, lists and
// links, no HTML knowledge needed. The HTML it produces is sanitized again on the server.
// `value` is read once when the editor mounts (or when `resetKey` changes); after that the
// editor owns the text and reports changes through onChange.
export default function RichTextEditor({ value, onChange, resetKey, minHeight = 420 }: { value: string; onChange: (html: string) => void; resetKey?: string | number; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  useEffect(() => { if (ref.current) ref.current.innerHTML = value }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (command: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }
  // The link bar (no browser prompt or alert). The text selection is kept while the bar is open.
  const openLink = () => {
    const sel = window.getSelection()
    savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    setLinkUrl(''); setLinkError(''); setLinking(true)
  }
  const restoreSelection = () => {
    ref.current?.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
  }
  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url) { setLinkError('Type a link, or use Remove link.'); return }
    if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(url)) { setLinkError('Use a link starting with https://, / (a page on your store), mailto: or tel:'); return }
    setLinking(false)
    restoreSelection()
    document.execCommand('createLink', false, url)
    if (ref.current) onChange(ref.current.innerHTML)
  }
  const removeLink = () => {
    setLinking(false)
    restoreSelection()
    document.execCommand('unlink')
    if (ref.current) onChange(ref.current.innerHTML)
  }
  const tools: { label: string; icon: React.ReactNode; action: () => void }[] = [
    { label: 'Heading', icon: <Heading2 size={16} />, action: () => run('formatBlock', '<h2>') },
    { label: 'Small heading', icon: <Heading3 size={16} />, action: () => run('formatBlock', '<h3>') },
    { label: 'Normal text', icon: <Pilcrow size={16} />, action: () => run('formatBlock', '<p>') },
    { label: 'Bold', icon: <Bold size={16} />, action: () => run('bold') },
    { label: 'Italic', icon: <Italic size={16} />, action: () => run('italic') },
    { label: 'Bulleted list', icon: <List size={16} />, action: () => run('insertUnorderedList') },
    { label: 'Numbered list', icon: <ListOrdered size={16} />, action: () => run('insertOrderedList') },
    { label: 'Link', icon: <Link2 size={16} />, action: openLink },
    { label: 'Undo', icon: <Undo2 size={16} />, action: () => run('undo') },
    { label: 'Redo', icon: <Redo2 size={16} />, action: () => run('redo') },
  ]
  return <div className={s.wrap}>
    <div className={s.toolbar} role="toolbar" aria-label="Text formatting">
      {tools.map((t, i) => <button key={t.label} type="button" className={`${s.tool} ${i === 3 || i === 5 || i === 8 ? s.gap : ''}`} title={t.label} aria-label={t.label} onMouseDown={e => { e.preventDefault(); t.action() }}>{t.icon}</button>)}
    </div>
    {linking ? <form className={s.linkBar} onSubmit={e => { e.preventDefault(); applyLink() }}>
      <input className={s.linkInput} value={linkUrl} onChange={e => { setLinkUrl(e.target.value); setLinkError('') }} placeholder="/contact or https://…" aria-label="Link address" aria-invalid={!!linkError} aria-describedby={linkError ? 'rte-link-error' : undefined} autoFocus />
      <button type="submit" className={s.linkBtn}>Add link</button>
      <button type="button" className={s.linkBtn} onClick={removeLink}>Remove link</button>
      <button type="button" className={s.linkBtn} onClick={() => setLinking(false)}>Cancel</button>
      {linkError ? <span id="rte-link-error" role="alert" className={s.linkError}>{linkError}</span> : null}
    </form> : null}
    <div
      ref={ref}
      className={s.editor}
      style={{ minHeight }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Text"
      aria-multiline="true"
      onInput={e => onChange((e.target as HTMLDivElement).innerHTML)}
      onPaste={e => {
        // Paste as plain text so formatting from Word or other websites doesn't come along.
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    />
  </div>
}
