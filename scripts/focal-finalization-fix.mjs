import fs from 'node:fs'

const path = 'components/focal-theme-editor.tsx'
if (!fs.existsSync(path)) process.exit(0)
let source = fs.readFileSync(path, 'utf8')
let changed = false

const replacements = [
  [
    "const save = async () => {",
    "const changePage = (nextPage:string) => { if (nextPage === page) return; if (dirty && typeof window !== 'undefined' && !window.confirm('You have unsaved changes. Switch templates anyway?')) return; setPage(nextPage); setSelectedId(''); setDrawer(false) }\n  const save = async () => {"
  ],
  [
    "onChange={event => { setPage(event.target.value); setSelectedId(''); setDrawer(false) }}",
    "onChange={event => changePage(event.target.value)}"
  ],
  [
    "Object.entries(META).filter(([key]) => !['announcement','header','footer'].includes(key))",
    "Object.entries(META).filter(([key]) => !['announcement','header'].includes(key))"
  ],
]

for (const [from, to] of replacements) {
  if (source.includes(from)) {
    const next = source.replace(from, to)
    if (next !== source) changed = true
    source = next
  }
}

if (changed) fs.writeFileSync(path, source)
console.log(`Focal finalization fix: ${changed ? 'updated' : 'already current'}`)
