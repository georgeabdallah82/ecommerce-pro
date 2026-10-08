// URL handles are plain Latin (a-z, 0-9, dashes) so they stay readable in links, sitemaps and
// ad-catalogue feeds. Arabic names are spelled out in Latin letters rather than dropped -- a
// product imported with an Arabic title used to get the address "/product/-" -- and accented
// letters lose their accent (e -> e). No imports, so the admin's client components can use it too.
//
// This file is deliberately pure ASCII (Arabic letters are written as code points and the
// patterns are built from escaped strings): one raw non-Latin character anywhere in the server
// bundle doubles the memory the whole bundle takes on Cloudflare -- see scripts/check-worker-charset.mjs.
const ARABIC_LATIN: Record<string, string> = Object.fromEntries(([
  [0x627, 'a'], [0x628, 'b'], [0x62a, 't'], [0x62b, 'th'], [0x62c, 'j'], [0x62d, 'h'], [0x62e, 'kh'], [0x62f, 'd'],
  [0x630, 'th'], [0x631, 'r'], [0x632, 'z'], [0x633, 's'], [0x634, 'sh'], [0x635, 's'], [0x636, 'd'], [0x637, 't'],
  [0x638, 'z'], [0x639, 'a'], [0x63a, 'gh'], [0x641, 'f'], [0x642, 'q'], [0x643, 'k'], [0x644, 'l'], [0x645, 'm'],
  [0x646, 'n'], [0x647, 'h'], [0x648, 'w'], [0x64a, 'y'], [0x649, 'a'], [0x629, 'a'],
  // Persian letters, and Arabic punctuation that separates words
  [0x67e, 'p'], [0x686, 'ch'], [0x698, 'zh'], [0x6af, 'g'], [0x6a9, 'k'], [0x6cc, 'y'],
  [0x60c, ' '], [0x61b, ' '], [0x61f, ' '],
] as Array<[number, string]>).concat(
  // Arabic-Indic and Persian digits
  Array.from({ length: 10 }, (_, d) => [0x660 + d, String(d)] as [number, string]),
  Array.from({ length: 10 }, (_, d) => [0x6f0 + d, String(d)] as [number, string]),
).map(([code, latin]) => [String.fromCharCode(code), latin]))

// NFKD splits accents and hamza marks off their letters (e.g. alef-with-hamza -> alef + hamza),
// so the marks, Arabic short vowels and the tatweel stretch can be dropped in one pass.
const MARKS = new RegExp('[\\u0300-\\u036f\\u0610-\\u061a\\u0640\\u064b-\\u065f\\u0670]', 'g')
const ARABIC = new RegExp('[\\u0600-\\u06ff]', 'g')

export function slugify(input: string) {
  return input
    .normalize('NFKD').replace(MARKS, '')
    .replace(ARABIC, ch => ARABIC_LATIN[ch] ?? '')
    .toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}
