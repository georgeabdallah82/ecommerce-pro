// Trust strip items are written by the owner ("Cash on delivery", "Easy returns"). This only picks a
// small picture that matches the words, so the text itself is never changed or invented.
export type TrustIconKind = 'truck' | 'cash' | 'return' | 'chat' | 'shield' | 'check'

const RULES: Array<[TrustIconKind, RegExp]> = [
  ['cash', /cash|pay|cod\b|money|\u062f\u0641\u0639|\u0643\u0627\u0634|\u0646\u0642\u062f|\u0627\u0644\u062f\u0641\u0639/i],
  ['return', /return|refund|exchange|replace|\u0627\u0633\u062a\u0631\u062c\u0627\u0639|\u0627\u0631\u062c\u0627\u0639|\u0625\u0631\u062c\u0627\u0639|\u0627\u0633\u062a\u0628\u062f\u0627\u0644/i],
  ['chat', /whats\s*app|support|help|chat|contact|message|\u0648\u0627\u062a\u0633|\u062f\u0639\u0645|\u0645\u0633\u0627\u0639\u062f\u0629|\u062a\u0648\u0627\u0635\u0644/i],
  ['truck', /deliver|shipping|ship|fast|track|\u062a\u0648\u0635\u064a\u0644|\u0634\u062d\u0646|\u062a\u062a\u0628\u0639|\u0633\u0631\u064a\u0639/i],
  ['shield', /secure|safe|protect|guarantee|warranty|\u0622\u0645\u0646|\u0627\u0645\u0646|\u062d\u0645\u0627\u064a\u0629|\u0636\u0645\u0627\u0646/i],
]

export function trustIconKind(...texts: Array<string | null | undefined>): TrustIconKind {
  const text = texts.filter(Boolean).join(' ')
  for (const [kind, pattern] of RULES) if (pattern.test(text)) return kind
  return 'check'
}

// First letter shown when a category has no photo yet (letters and digits only; "?" never shown).
export function categoryInitial(name: unknown) {
  const match = String(name ?? '').trim().match(/[\p{L}\p{N}]/u)
  return match ? match[0].toLocaleUpperCase() : ''
}
