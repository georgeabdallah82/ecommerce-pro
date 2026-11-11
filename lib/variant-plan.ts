// Product variants: which option combinations exist, which existing variants are kept, which are
// new, and which would be removed. The product editor shows this plan before "Generate variants"
// changes anything, so the preview and the result come from the same rules.

export type Option = Record<string, string>
// The parts of a variant the plan needs. A variant's stock is its quantity, or the sum of its
// stock records when it has no single quantity.
export type VariantLike = { sku: string; optionJson: string; quantity?: number; inventory?: Array<{ quantity?: number; reserved?: number }> }

export function parseOptionJson(value: string | null | undefined): Option {
  try {
    const parsed = JSON.parse(value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
  } catch { return {} }
}

// The same options in any order are the same variant: {Size: S, Colour: Red} equals {Colour: Red, Size: S}.
export function optionKey(options: Option): string {
  return JSON.stringify(Object.keys(options).sort().map(k => [k, options[k]]))
}

// Every combination of the options that have a name and at least one value: Size S, M and Colour
// Red gives "S / Red" and "M / Red".
export function optionCombinations(names: string[], values: string[][]): Array<{ name: string; options: Option }> {
  const active = names.map((name, i) => ({ name: name.trim(), values: (values[i] || []).map(v => v.trim()).filter(Boolean) })).filter(x => x.name && x.values.length)
  if (!active.length) return []
  return active.reduce<Array<{ name: string; options: Option }>>(
    (acc, opt) => acc.flatMap(row => opt.values.map(value => ({ name: row.name ? `${row.name} / ${value}` : value, options: { ...row.options, [opt.name]: value } }))),
    [{ name: '', options: {} }],
  )
}

// A SKU no other variant uses: the product's SKU with -1, -2, ... after it, skipping any taken.
export function freeSku(base: string, used: Set<string>): string {
  const root = base.trim() || 'VARIANT'
  for (let n = 1; ; n++) {
    const candidate = `${root}-${n}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

export function stockOf(v: VariantLike): number {
  if (v.quantity !== undefined) return Number(v.quantity)
  return (v.inventory || []).reduce((sum, x) => sum + Number(x.quantity || 0) - Number(x.reserved || 0), 0)
}

export type VariantPlan<T> = { next: T[]; added: T[]; kept: T[]; removed: T[] }

// `baseSku` is the product's SKU, which new variant SKUs grow from. `create` builds a new variant
// for a combination; `sku` is already free.
export function planVariants<T extends VariantLike>(current: T[], names: string[], values: string[][], baseSku: string, create: (combo: { name: string; options: Option }, sku: string) => T): VariantPlan<T> {
  const combos = optionCombinations(names, values)
  const byOptions = new Map(current.map(v => [optionKey(parseOptionJson(v.optionJson)), v]))
  const used = new Set(current.map(v => v.sku.trim().toLowerCase()).filter(Boolean))
  const next: T[] = []
  const added: T[] = []
  const kept: T[] = []
  for (const combo of combos) {
    const existing = byOptions.get(optionKey(combo.options))
    if (existing) { next.push(existing); kept.push(existing); continue }
    const sku = freeSku(baseSku, used)
    used.add(sku.toLowerCase())
    const created = create(combo, sku)
    next.push(created); added.push(created)
  }
  const keep = new Set<T>(kept)
  const removed = current.filter(v => !keep.has(v))
  return { next, added, kept, removed }
}

export function describeVariantPlan<T>(plan: VariantPlan<T>): string {
  const parts = [`adds ${plan.added.length}`, `keeps ${plan.kept.length}`]
  if (plan.removed.length) parts.push(`removes ${plan.removed.length}`)
  return parts.join(', ')
}
