'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertCircle, ArrowDown, CheckCircle2, ExternalLink, RotateCcw } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-policies.module.css'
import RichTextEditor from './rich-text-editor'
import { useConfirm } from './admin-confirm'
import { defaultPolicyHtml, POLICY_PATHS, POLICY_TITLES, type PolicyKind, type PolicyVars } from '@/lib/policy-templates'

const KINDS: PolicyKind[] = ['refund', 'privacy', 'terms']

type Setup = { email: boolean; phone: boolean; address: boolean; returnDays: boolean; refundTime: boolean; damageReportHours: boolean }

// Words in a policy's text (tags removed), for the "how long is it" hint.
function wordCount(html: string) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()
  return text ? text.split(/\s+/).length : 0
}

async function save(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Unable to save')
}

export default function PoliciesAdmin({ vars, custom: initialCustom, setup, canManage }: { vars: PolicyVars; custom: Record<PolicyKind, string>; setup: Setup; canManage: boolean }) {
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

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Ctrl+S / Cmd+S saves the policy being edited.
  useEffect(() => {
    if (!canManage) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && !busy) void saveText()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, busy, canManage, kind, draft])

  const words = useMemo(() => wordCount(draft), [draft])
  const missing: { label: string; ok: boolean; href: string; need: string }[] = [
    { label: 'Contact email', ok: setup.email, href: '/admin/settings', need: 'Customers reach you here. Add it in Settings › General.' },
    { label: 'Phone / WhatsApp', ok: setup.phone, href: '/admin/settings', need: 'Shown on the policy pages. Add it in Settings › General.' },
    { label: 'Business address', ok: setup.address, href: '/admin/settings', need: 'Privacy and terms pages need a business address. Add it in Settings › General.' },
    ...(returnsEnabled ? [{ label: 'Return window', ok: setup.returnDays, href: '/admin/settings', need: 'Your refund policy quotes this number of days. Set it in Settings › General › Policies.' }] : []),
    { label: 'Refund processing time', ok: setup.refundTime, href: '/admin/settings', need: 'Tells customers when their refund arrives. Set it in Settings › General › Policies.' },
    { label: 'Damage report window', ok: setup.damageReportHours, href: '/admin/settings', need: 'How long customers have to report damaged items. Set it in Settings › General › Policies.' },
  ]
  const missingCount = missing.filter(m => !m.ok).length


  // True when policy k is the one in the editor afterwards (switching asks first when there are unsaved edits).
  async function switchTab(k: PolicyKind) {
    if (k === kind) return true
    if (dirty && !(await confirm({ title: 'Discard your changes?', message: `Your edits to the ${POLICY_TITLES[kind]} are not saved yet.`, confirmLabel: 'Discard' }))) return false
    setNotice(''); setError('')
    load(k, shown(k))
    return true
  }

  // The cards at the top: the editor is further down the page, so it comes into view (it used to change out of
  // sight, and the click looked like it did nothing).
  async function editFromCard(k: PolicyKind) {
    if (!(await switchTab(k))) return
    window.setTimeout(() => {
      document.getElementById('policy-tabs')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      document.getElementById(`policy-tab-${k}`)?.focus({ preventScroll: true })
    }, 0)
  }

  // The tabs: arrow keys, Home and End move between them; Enter or Space opens one.
  function onTabKey(e: React.KeyboardEvent) {
    const at = KINDS.findIndex(k => document.activeElement?.id === `policy-tab-${k}`)
    if (at < 0) return
    const next = e.key === 'ArrowRight' ? (at + 1) % KINDS.length : e.key === 'ArrowLeft' ? (at - 1 + KINDS.length) % KINDS.length : e.key === 'Home' ? 0 : e.key === 'End' ? KINDS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    document.getElementById(`policy-tab-${KINDS[next]}`)?.focus()
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

    <div className={s.overview}>
      {KINDS.map(k => {
        const text = custom[k] || defaultPolicyHtml(k, v)
        return <button key={k} type="button" className={`${ui.card} ${s.overviewCard} ${kind === k ? s.overviewOn : ''}`} onClick={() => editFromCard(k)}>
          <span className={custom[k] ? s.badgeCustom : s.badgeDefault}>{custom[k] ? 'Your text' : 'Default text'}</span>
          <strong>{POLICY_TITLES[k]}</strong>
          <span className={ui.muted}>{wordCount(text).toLocaleString()} words · {custom[k] ? 'edited by you' : 'filled in from your settings'}</span>
          <span className={s.overviewLink}>Edit below <ArrowDown size={12} aria-hidden="true" /></span>
        </button>
      })}
    </div>

    <section className={`${ui.card} ${s.checklist}`} aria-labelledby="policy-checklist">
      <div className={s.checklistHead}>
        <div><h2 id="policy-checklist">Before you publish</h2><p className={ui.muted}>The policies quote these details. Fill in what’s missing so customers see complete pages.</p></div>
        <span className={missingCount ? s.countWarn : s.countOk}>{missingCount ? `${missingCount} missing` : 'All set'}</span>
      </div>
      <ul className={s.checkItems}>
        {missing.map(m => <li key={m.label} className={m.ok ? s.checkOk : s.checkTodo}>
          {m.ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
          <div><strong>{m.label}</strong>{!m.ok && <span className={ui.muted}>{m.need}</span>}</div>
          {!m.ok && <Link className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={m.href}>Fill in</Link>}
        </li>)}
      </ul>
    </section>

    <div id="policy-tabs" className={s.tabs} role="tablist" aria-label="Policies" onKeyDown={onTabKey}>
      {KINDS.map(k => <button key={k} id={`policy-tab-${k}`} role="tab" aria-selected={kind === k} aria-controls="policy-panel" tabIndex={kind === k ? 0 : -1} className={kind === k ? s.tabOn : ''} onClick={() => switchTab(k)}>
        {POLICY_TITLES[k]}<span className={custom[k] ? s.badgeCustom : s.badgeDefault}>{custom[k] ? 'Your text' : 'Default'}</span>
      </button>)}
    </div>

    <div id="policy-panel" role="tabpanel" aria-labelledby={`policy-tab-${kind}`} className={`${ui.card} ${s.editorCard}`}>
      <div className={s.editorBar}>
        <div className={ui.muted}>{custom[kind] ? 'Your own text is shown on the store.' : 'Showing our default text, filled in from Settings. Edit it to make it yours.'} <span className={s.words}>{words.toLocaleString()} words{dirty ? ' · unsaved changes' : ''}</span></div>
        <div className={s.editorActions}>
          <Link className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} href={POLICY_PATHS[kind]} target="_blank"><ExternalLink size={13} /> View on store</Link>
          {canManage && custom[kind] && <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={useDefault} disabled={busy}><RotateCcw size={13} /> Use default text</button>}
          {canManage && <button className={`${ui.btn} ${ui.btnSmall}`} onClick={saveText} disabled={busy || !dirty} title="Save (Ctrl+S)">{busy ? 'Saving…' : 'Save'}</button>}
        </div>
      </div>
      {refundMismatch && <div className={`${ui.alert} ${s.inlineAlert}`}>Returns are off, but this is your own refund policy text. Check it doesn’t still offer returns, or <button type="button" className={ui.textButton} onClick={() => load('refund', defaultPolicyHtml('refund', { ...vars, returnsEnabled: false }), true)}>load the “all sales are final” text</button> and save.</div>}
      {canManage
        ? <RichTextEditor value={draft} resetKey={`${kind}-${editorKey}`} onChange={html => { setDraft(html); setDirty(true); setNotice('') }} label={`${POLICY_TITLES[kind]} text`} />
        : <div className={s.readOnly} dangerouslySetInnerHTML={{ __html: draft }} />}
      <p className={`${ui.muted} ${s.footNote}`}>Your contact details (Settings › General) are added under the text automatically, with a “Last updated” date at the top.</p>
    </div>
  </div>
}
