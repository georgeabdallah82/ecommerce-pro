// Fails the Cloudflare build if the server bundle contains any character above U+00FF.
//
// The whole server (all pages and API routes, ~18 MB of code) runs as one script on Cloudflare,
// and the JavaScript engine stores a script's source at one byte per character only while every
// character fits in Latin-1. A single "€", "–" or Arabic letter left raw in a regular expression
// or template string -- the minifier keeps those as-is, while ordinary strings get escaped -- makes
// it store the entire bundle at two bytes per character: about 18 MB more of the Worker's 128 MB
// memory limit. That pushed busy pages over the limit and customers got "error 1102" pages.
//
// Fix a failure by writing the character as an escape inside a string, e.g.
// new RegExp('[\\u0600-\\u06ff]') instead of /[؀-ۿ]/ (lib/slug.ts shows the pattern).
import { readFileSync, existsSync } from 'node:fs'

const bundles = ['.open-next/server-functions/default/handler.mjs', '.open-next/middleware/handler.mjs']
let failed = false
for (const file of bundles) {
  if (!existsSync(file)) { console.error(`[charset] ${file} not found -- run the Cloudflare build first`); process.exit(1) }
  const source = readFileSync(file, 'utf8')
  const hits = []
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) > 0xff) {
      hits.push(i)
      if (hits.length >= 10) break
    }
  }
  if (!hits.length) { console.log(`[charset] ${file}: Latin-1 only`); continue }
  failed = true
  console.error(`[charset] ${file}: characters above U+00FF found. Each doubles the memory of the whole bundle on Cloudflare:`)
  for (const i of hits) {
    const ch = source[i]
    console.error(`  U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} in: ${JSON.stringify(source.slice(Math.max(0, i - 60), i + 30))}`)
  }
}
if (failed) {
  console.error('[charset] Write these characters as \\u escapes inside a string (see the comment at the top of scripts/check-worker-charset.mjs).')
  process.exit(1)
}
