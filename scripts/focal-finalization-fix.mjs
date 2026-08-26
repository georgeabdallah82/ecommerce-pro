import fs from 'node:fs'

const path = 'components/focal-theme-editor.tsx'
if (!fs.existsSync(path)) process.exit(0)

let source = fs.readFileSync(path, 'utf8')
let changed = false

const declaration = "const changePage = (nextPage:string) => { if (nextPage === page) return; if (dirty && typeof window !== 'undefined' && !window.confirm('You have unsaved changes. Switch templates anyway?')) return; setPage(nextPage); setSelectedId(''); setDrawer(false) }"

const declarationPattern = /\s*const changePage = \(nextPage:string\) => \{ if \(nextPage === page\) return; if \(dirty && typeof window !== 'undefined' && !window\.confirm\('You have unsaved changes\. Switch templates anyway\?'\)\) return; setPage\(nextPage\); setSelectedId\(''\); setDrawer\(false\) \}/g

const matches = source.match(declarationPattern) || []
if (matches.length === 0) {
  const marker = 'const save = async () => {'
  if (source.includes(marker)) {
    source = source.replace(marker, `${declaration}\n  ${marker}`)
    changed = true
  }
} else if (matches.length > 1) {
  let first = true
  source = source.replace(declarationPattern, () => {
    if (first) { first = false; return `\n  ${declaration}` }
    return ''
  })
  changed = true
}

const selectorOld = "onChange={event => { setPage(event.target.value); setSelectedId(''); setDrawer(false) }}"
const selectorNew = "onChange={event => changePage(event.target.value)}"
if (source.includes(selectorOld)) {
  source = source.replace(selectorOld, selectorNew)
  changed = true
}

const pickerOld = "Object.entries(META).filter(([key]) => !['announcement','header','footer'].includes(key))"
const pickerNew = "Object.entries(META).filter(([key]) => !['announcement','header'].includes(key))"
if (source.includes(pickerOld)) {
  source = source.replace(pickerOld, pickerNew)
  changed = true
}

if (changed) fs.writeFileSync(path, source)

const finalCount = (source.match(/const changePage = \(nextPage:string\) =>/g) || []).length
if (finalCount !== 1) {
  console.error(`Focal finalization fix failed: expected exactly one changePage declaration, found ${finalCount}`)
  process.exit(1)
}

console.log(`Focal finalization fix: ${changed ? 'updated' : 'already current'}`)
