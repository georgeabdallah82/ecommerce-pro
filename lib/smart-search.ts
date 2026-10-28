// Product search that forgives the way people type: small typos ("tisue" finds "Tissue"), Arabic
// spelling variants (أ/إ/آ, ة/ه, ى/ي, vowel marks) and the store's own word list (Settings >
// Selling tools > Search words), e.g. "soap = sabon, saboun, صابون" for Arabizi.
// The whole catalogue is small enough to score in memory; the list is read once and shared
// briefly like the other storefront data.

export type SearchDoc = { id: string; fields: Array<{ text: string; weight: number }> }

const ARABIC_ALEF = new RegExp('[\\u0622\\u0623\\u0625\\u0671]', 'g')
const ARABIC_TEH_MARBUTA = new RegExp('\\u0629', 'g')
const ARABIC_YEH = new RegExp('\\u0649', 'g')
const ARABIC_MARKS = new RegExp('[\\u064B-\\u065F\\u0670\\u0640]', 'g')
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g')
const NOT_WORD = /[^\p{L}\p{N}]+/gu

export function normalize(text: string) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(COMBINING, '')
    .replace(ARABIC_MARKS, '')
    .replace(ARABIC_ALEF, 'ا')
    .replace(ARABIC_TEH_MARBUTA, 'ه')
    .replace(ARABIC_YEH, 'ي')
    .replace(NOT_WORD, ' ')
    .trim()
}

export const words = (text: string) => normalize(text).split(' ').filter(Boolean)

// Typos allowed for a word of this length: none for short words, then one, then two.
const allowed = (length: number) => (length <= 3 ? 0 : length <= 6 ? 1 : 2)

// Edit distance with swapped letters counting once; stops early past the limit.
export function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  const prev2: number[] = new Array(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > limit) return limit + 1
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    prev = cur
  }
  return prev[b.length]
}

// How well one typed word matches one word of the product (0 = not at all).
export function wordScore(typed: string, word: string) {
  if (typed === word) return 1
  if (word.startsWith(typed) && typed.length >= 2) return 0.9
  if (typed.length >= 4 && word.includes(typed)) return 0.7
  const limit = allowed(Math.min(typed.length, word.length))
  if (!limit) return 0
  const d = distance(typed, word.slice(0, typed.length + limit), limit)
  if (d <= limit) return 0.65 - 0.1 * d
  const whole = distance(typed, word, limit)
  return whole <= limit ? 0.6 - 0.1 * whole : 0
}

// "soap = sabon, saboun, صابون" (one group per line): each word stands for the others.
export function parseSynonyms(text: string) {
  return String(text || '').split(/\r?\n/).map(line => words(line.replace(/[=,;|]/g, ' '))).filter(group => group.length > 1)
}

function expand(typed: string, groups: string[][]) {
  const alternatives = new Set([typed])
  for (const group of groups) if (group.some(w => w === typed || (typed.length >= 4 && wordScore(typed, w) >= 0.6))) for (const w of group) alternatives.add(w)
  return [...alternatives]
}

// Product ids that match the search, best first. Every typed word must match something (or,
// when nothing matches them all, products matching most of them are returned instead).
export function searchDocs(query: string, docs: SearchDoc[], synonyms = '', limit = 200) {
  const typed = words(query).slice(0, 8)
  if (!typed.length) return []
  const groups = parseSynonyms(synonyms)
  const alternatives = typed.map(t => expand(t, groups))
  const phrase = normalize(query)
  const scored: Array<{ id: string; score: number; matched: number }> = []
  for (const doc of docs) {
    const fields = doc.fields.map(f => ({ words: words(f.text), weight: f.weight, text: normalize(f.text) }))
    let score = 0
    let matched = 0
    for (const options of alternatives) {
      let best = 0
      for (const field of fields) for (const option of options) for (const word of field.words) {
        const s = wordScore(option, word) * field.weight
        if (s > best) best = s
      }
      if (best > 0) { matched++; score += best }
    }
    if (!matched) continue
    if (phrase.length >= 3 && fields.some(f => f.text.includes(phrase))) score += 2
    scored.push({ id: doc.id, score, matched })
  }
  const all = scored.filter(s => s.matched === typed.length)
  const pool = all.length ? all : scored.filter(s => s.matched >= Math.max(1, Math.ceil(typed.length / 2)))
  return pool.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.id)
}

// "Did you mean": for a search with no results, the closest word the catalogue knows for each
// typed word, when it is within the same typo allowance the search uses. Null when nothing
// better is known (or the typed words are already right).
export function spellingSuggestion(query: string, vocabulary: Iterable<string>) {
  const typed = words(query)
  if (!typed.length) return null
  const known = new Set(vocabulary)
  const fixed = typed.map(word => {
    if (known.has(word) || word.length < 4) return word
    const limit = allowed(word.length)
    let best = word
    let bestDistance = limit + 1
    for (const candidate of known) {
      if (Math.abs(candidate.length - word.length) > limit) continue
      const d = distance(word, candidate, limit)
      if (d < bestDistance) { bestDistance = d; best = candidate }
    }
    return bestDistance <= limit ? best : word
  })
  const suggestion = fixed.join(' ')
  return suggestion !== typed.join(' ') ? suggestion : null
}
