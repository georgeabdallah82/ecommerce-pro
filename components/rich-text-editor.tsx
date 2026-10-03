'use client'

import { useEffect, useRef } from 'react'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pilcrow, Redo2, Undo2 } from 'lucide-react'
import s from './rich-text-editor.module.css'

// A small word-processor style editor for long text (policies): headings, bold, lists and
// links, no HTML knowledge needed. The HTML it produces is sanitized again on the server.
// `value` is read once when the editor mounts (or when `resetKey` changes); after that the
// editor owns the text and reports changes through onChange.
export default function RichTextEditor({ value, onChange, resetKey, minHeight = 420 }: { value: string; onChange: (html: string) => void; resetKey?: string | number; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.innerHTML = value }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (command: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }
  const link = () => {
    const url = window.prompt('Link address (e.g. /contact or https://…)')
    if (url === null) return
    if (!url.trim()) return run('unlink')
    if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(url.trim())) return window.alert('Use a link starting with https://, / (a page on your store), mailto: or tel:')
    run('createLink', url.trim())
  }
  const tools: { label: string; icon: React.ReactNode; action: () => void }[] = [
    { label: 'Heading', icon: <Heading2 size={16} />, action: () => run('formatBlock', '<h2>') },
    { label: 'Small heading', icon: <Heading3 size={16} />, action: () => run('formatBlock', '<h3>') },
    { label: 'Normal text', icon: <Pilcrow size={16} />, action: () => run('formatBlock', '<p>') },
    { label: 'Bold', icon: <Bold size={16} />, action: () => run('bold') },
    { label: 'Italic', icon: <Italic size={16} />, action: () => run('italic') },
    { label: 'Bulleted list', icon: <List size={16} />, action: () => run('insertUnorderedList') },
    { label: 'Numbered list', icon: <ListOrdered size={16} />, action: () => run('insertOrderedList') },
    { label: 'Link', icon: <Link2 size={16} />, action: link },
    { label: 'Undo', icon: <Undo2 size={16} />, action: () => run('undo') },
    { label: 'Redo', icon: <Redo2 size={16} />, action: () => run('redo') },
  ]
  return <div className={s.wrap}>
    <div className={s.toolbar} role="toolbar" aria-label="Text formatting">
      {tools.map((t, i) => <button key={t.label} type="button" className={`${s.tool} ${i === 3 || i === 5 || i === 8 ? s.gap : ''}`} title={t.label} aria-label={t.label} onMouseDown={e => { e.preventDefault(); t.action() }}>{t.icon}</button>)}
    </div>
    <div
      ref={ref}
      className={s.editor}
      style={{ minHeight }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
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
