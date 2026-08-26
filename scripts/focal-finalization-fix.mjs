import fs from 'node:fs'

const path = 'components/focal-theme-editor.tsx'
if (!fs.existsSync(path)) process.exit(0)

let source = fs.readFileSync(path, 'utf8')
let changed = false

const replaceOnce = (from, to) => {
  if (!source.includes(from)) return false
  const next = source.replace(from, to)
  if (next === source) return false
  source = next
  changed = true
  return true
}

const declaration = "const changePage = (nextPage:string) => { if (nextPage === page) return; if (dirty && typeof window !== 'undefined' && !window.confirm('You have unsaved changes. Switch templates anyway?')) return; setPage(nextPage); setSelectedId(''); setDrawer(false) }"

const declarationPattern = /\s*const changePage = \(nextPage:string\) => \{ if \(nextPage === page\) return; if \(dirty && typeof window !== 'undefined' && !window\.confirm\('You have unsaved changes\. Switch templates anyway\?'\)\) return; setPage\(nextPage\); setSelectedId\(''\); setDrawer\(false\) \}/g
const matches = source.match(declarationPattern) || []
if (matches.length === 0) {
  replaceOnce('const save = async () => {', `${declaration}\n  const save = async () => {`)
} else if (matches.length > 1) {
  let kept = false
  source = source.replace(declarationPattern, () => {
    if (kept) { changed = true; return '' }
    kept = true
    return `\n  ${declaration}`
  })
  changed = true
}

replaceOnce("onChange={event => { setPage(event.target.value); setSelectedId(''); setDrawer(false) }}", "onChange={event => changePage(event.target.value)}")
replaceOnce("Object.entries(META).filter(([key]) => !['announcement','header','footer'].includes(key))", "Object.entries(META).filter(([key]) => !['announcement','header'].includes(key))")

const footerStatePattern = /\n\s*const footerEnabled = current\.some\(section => section\.type === 'footer' && section\.enabled !== false\)\n\s*const previewTheme = useMemo\(\(\) => \(\{ \.\.\.theme, editorTemplates: \{ \.\.\.\(theme\.editorTemplates \|\| \{\}\), Pages: current \} \}\), \[theme, current\]\)/
if (footerStatePattern.test(source)) {
  source = source.replace(footerStatePattern, '')
  changed = true
}

const duplicateFooter = /\{!footerEnabled && <div style=\{\{display:'none'\}\} \/>\}/
if (duplicateFooter.test(source)) {
  source = source.replace(duplicateFooter, '')
  changed = true
}

if (changed) fs.writeFileSync(path, source)

const finalCount = (source.match(/const changePage = \(nextPage:string\) =>/g) || []).length
if (finalCount !== 1) {
  console.error(`Focal finalization fix failed: expected exactly one changePage declaration, found ${finalCount}`)
  process.exit(1)
}

console.log(`Focal finalization fix: ${changed ? 'updated' : 'already current'}`)
