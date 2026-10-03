'use client'

import { useState, type InputHTMLAttributes } from 'react'

// Number boxes that let people type freely. A box bound straight to a number reformats on every
// key press: "1" turns into "1.00" so the next digit lands after the decimals, a cleared box
// snaps back to 0 or 1 and "5" then reads "05" or "15". These keep exactly what was typed while
// the box has focus, pass the parsed number up as it changes, and show the tidy value (the
// parent's, after any clamping) once the box loses focus.

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'>

function useDraft(shown: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState<string | null>(null)
  return {
    value: draft ?? shown,
    // A zero is selected on focus so typing replaces it instead of landing next to it.
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { setDraft(shown); if (/^-?0(\.0+)?$/.test(shown)) e.target.select() },
    onChange: (text: string) => { setDraft(text); commit(text) },
    onBlur: () => setDraft(null),
  }
}

function clean(text: string, decimals: boolean, negative: boolean) {
  let t = text.replace(',', '.').replace(decimals ? /[^0-9.-]/g : /[^0-9-]/g, '')
  t = (negative && t.startsWith('-') ? '-' : '') + t.replace(/-/g, '')
  return t
}

// Whole or decimal numbers. `value` null/undefined shows an empty box; an empty box reports
// `empty` (null by default) so the parent can choose what "nothing typed" means.
export function NumInput({ value, onValue, decimals = false, negative = false, empty = null, onFocus, onBlur, ...rest }: Base & {
  value: number | null | undefined
  onValue: (value: number | null) => void
  decimals?: boolean
  negative?: boolean
  empty?: number | null
}) {
  const shown = value == null || !Number.isFinite(value) ? '' : String(value)
  const d = useDraft(shown, t => {
    if (t === '' || t === '-' || t === '.') return onValue(empty)
    const n = Number(t)
    if (Number.isFinite(n)) onValue(n)
  })
  return <input {...rest} type="text" inputMode={decimals ? 'decimal' : 'numeric'} autoComplete="off"
    value={d.value}
    onFocus={e => { d.onFocus(e); onFocus?.(e) }}
    onBlur={e => { d.onBlur(); onBlur?.(e) }}
    onChange={e => d.onChange(clean(e.target.value, decimals, negative))} />
}

// Money stored in cents, typed in dollars ("12.5" -> 1250). Shown with two decimals when the
// box is not being edited.
export function MoneyInput({ cents, onCents, empty = null, onFocus, onBlur, ...rest }: Base & {
  cents: number | null | undefined
  onCents: (cents: number | null) => void
  empty?: number | null
}) {
  const shown = cents == null || !Number.isFinite(cents) ? '' : (cents / 100).toFixed(2)
  const d = useDraft(shown, t => {
    if (t === '' || t === '.') return onCents(empty)
    const n = Number(t)
    if (Number.isFinite(n)) onCents(Math.round(n * 100))
  })
  return <input {...rest} type="text" inputMode="decimal" autoComplete="off"
    value={d.value}
    onFocus={e => { d.onFocus(e); onFocus?.(e) }}
    onBlur={e => { d.onBlur(); onBlur?.(e) }}
    onChange={e => d.onChange(clean(e.target.value, true, false))} />
}
