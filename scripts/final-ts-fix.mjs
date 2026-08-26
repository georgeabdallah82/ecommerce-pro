import fs from 'node:fs'

const path = 'components/focal-theme-editor.tsx'
if (!fs.existsSync(path)) process.exit(0)

let source = fs.readFileSync(path, 'utf8')
const bad = "{!footerEnabled && <div style={{display:'none'}} /> }"
const bad2 = "{!footerEnabled && <div style={{display:'none'}} /> }"
const replacements = [
  bad,
  bad2,
  "{!footerEnabled && <div style={{display:'none'}} />}",
]
let changed = false
for (const needle of replacements) {
  if (source.includes(needle)) {
    source = source.replace(needle, '')
    changed = true
  }
}
if (changed) fs.writeFileSync(path, source)
console.log(changed ? 'Removed stale footerEnabled Theme Editor reference' : 'No stale footerEnabled reference found')
