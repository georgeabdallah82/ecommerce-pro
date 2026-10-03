'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, RotateCcw } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-policies.module.css'
import RichTextEditor from './rich-text-editor'
import { useConfirm } from './admin-confirm'
import { defaultPolicyHtml, POLICY_PATHS, POLICY_TITLES, type PolicyKind, type PolicyVars } from '@/lib/policy-templates'

const KINDS: PolicyKind[] = ['refund', 'privacy', 'terms']

async function save(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Unable to save')
}

export default function PoliciesAdmin({ vars, custom: initialCustom, canManage }: { vars: PolicyVars; custom: Record<PolicyKind, string>; canManage: boolean }) {
  const confirm = useConfirm()
  const [kind, setKind] = useState<PolicyKind>('refund')
  const [returnsEnabled, setReturnsEnabled] = useState(vars.returnsEnabled)
  const [custom, setCustom] = useState(initialCustom)
  const v = { ...vars, returnsEnabled }
  const shown = (k: PolicyKind) => custom[k] || defaultPolicyHtml(k, v)
  const [draft, setDraft] = useState(() => shown('refund'))
  const [editorKey, setEditorKey] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = (k: PolicyKind, html: string, isDirty = false) => { setKind(k); setDraft(html); setEditorKey(x => x + 1); setDirty(isDirty) }

  async function switchTab(k: PolicyKind) {
    if (k === kind) return
    if (dirty && !(await confirm({ title: 'Discard your changes?', message: `Your edits to the ${POLICY_TITLES[kind]} are not saved yet.`, confirmLabel: 'Discard' }))) return
    setNotice(''); setError('')
    load(k, shown(k))
  }

  async function saveText() {
    setBusy(true); setError(''); setNotice('')
    try {
      await save({ kind, html: draft })
      setCustom(c => ({ ...c, [kind]: draft })); setDirty(false)
      setNotice(`${POLICY_TITLES[kind]} saved. It is live on your store now.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  async function useDefault() {
    if (!(await confirm({ title: 'Go back to the default text?', message: `Your own ${POLICY_TITLES[kind]} text is removed and the store shows our standard wording, filled in with your settings (return days, contact details).`, confirmLabel: 'Use default text' }))) return
    setBusy(true); setError('')
    try {
      await save({ kind, html: '' })
      setCustom(c => ({ ...c, [kind]: '' })); load(kind, defaultPolicyHtml(kind, v))
      setNotice(`${POLICY_TITLES[kind]} now uses the default text.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  async function toggleReturns(next: boolean) {
    const ok = next
      ? await confirm({ title: 'Start accepting returns?', message: 'Customers can request a return from their order page, product pages show "Easy returns", and the default refund policy explains your return window.', confirmLabel: 'Accept returns' })
      : await confirm({ title: 'Stop accepting returns?', message: 'Customers can no longer request a return, "Easy returns" is removed from product pages, and the default refund policy says all sales are final (damaged or wrong items are still replaced).', confirmLabel: 'Stop returns' })
    if (!ok) return
    setBusy(true); setError('')
    try {
      await save({ returnsEnabled: next })
      setReturnsEnabled(next)
      // Untouched default text follows the switch straight away.
      if (!dirty && !custom[kind]) load(kind, defaultPolicyHtml(kind, { ...vars, returnsEnabled: next }))
      setNotice(next ? 'Returns are on.' : 'Returns are off. All sales are final on your store.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  const refundMismatch = kind === 'refund' && Boolean(custom.refund) && !returnsEnabled

  return <div className={s.page}>
    <div className={s.head}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>ONLINE STORE</span><h1 className={ui.title}>Policies</h1>
        <p className={ui.muted}>The refund, privacy and terms pages linked in your store footer. Write your own text or keep ours.</p></div>
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role="status">{error || notice}</div>}

    <div className={`${ui.card} ${s.returnsCard}`}>
      <div>
        <strong>We accept returns</strong>
        <p className={ui.muted}>{returnsEnabled
          ? 'On: customers can ask to return items from their order page within your return window.'
          : 'Off: all sales are final. Customers can’t request returns and product pages don’t promise “Easy returns”. Damaged or wrong items: the refund policy offers a replacement.'}</p>
      </div>
      <button type="button" role="switch" aria-checked={returnsEnabled} aria-label="We accept returns" disabled={!canManage || busy} className={`${s.switch} ${returnsEnabled ? s.on : ''}`} onClick={() => toggleReturns(!returnsEnabled)}><i /></button>
    </div>

    <div className={s.tabs} role="tablist">
      {KINDS.map(k => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? s.tabOn : ''} onClick={() => switchTab(k)}>
        {POLICY_TITLES[k]}<span className={custom[k] ? s.badgeCustom : s.badgeDefault}>{custom[k] ? 'Your text' : 'Default'}</span>
      </button>)}
    </div>

    <div className={`${ui.card} ${s.editorCard}`}>
      <div className={s.editorBar}>
        <div className={ui.muted}>{custom[kind] ? 'Your own text is shown on the store.' : 'Showing our default text, filled in from Settings. Edit it to make it yours.'}</div>
        <div className={s.editorActions}>
          <Link className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} href={POLICY_PATHS[kind]} target="_blank"><ExternalLink size={13} /> View on store</Link>
          {canManage && custom[kind] && <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={useDefault} disabled={busy}><RotateCcw size={13} /> Use default text</button>}
          {canManage && <button className={`${ui.btn} ${ui.btnSmall}`} onClick={saveText} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>}
        </div>
      </div>
      {refundMismatch && <div className={`${ui.alert} ${s.inlineAlert}`}>Returns are off, but this is your own refund policy text. Check it doesn’t still offer returns, or <button type="button" className={ui.textButton} onClick={() => load('refund', defaultPolicyHtml('refund', { ...vars, returnsEnabled: false }), true)}>load the “all sales are final” text</button> and save.</div>}
      {canManage
        ? <RichTextEditor value={draft} resetKey={`${kind}-${editorKey}`} onChange={html => { setDraft(html); setDirty(true); setNotice('') }} />
        : <div className={s.readOnly} dangerouslySetInnerHTML={{ __html: draft }} />}
      <p className={`${ui.muted} ${s.footNote}`}>Your contact details (Settings › Store contact) are added under the text automatically, with a “Last updated” date at the top.</p>
    </div>
  </div>
}
