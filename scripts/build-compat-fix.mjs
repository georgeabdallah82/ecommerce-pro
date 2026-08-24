import fs from 'node:fs'

function fixFile(path, replacements) {
  let source = fs.readFileSync(path, 'utf8')
  let changed = false
  for (const [bad, good] of replacements) {
    if (source.includes(bad)) {
      source = source.replace(bad, good)
      changed = true
    }
  }
  if (changed) fs.writeFileSync(path, source)
  return changed
}

const themeChanged = fixFile('components/pro-theme-editor.tsx', [
  ['<DesignInspector section={selected} theme={theme} patch={patch}/>', '<DesignInspector section={selected} patch={patch}/>'],
])
console.log(themeChanged ? 'Applied DesignInspector prop compatibility fix' : 'No DesignInspector compatibility fix needed')

const ordersChanged = fixFile('components/admin-orders.tsx', [
  ['import { FileText, Plus, RefreshCw, Search, Truck, X } from \'lucide-react\'', 'import { FileText, PackageCheck, Plus, RefreshCw, Search, Truck, X } from \'lucide-react\''],
])
console.log(ordersChanged ? 'Applied Orders icon compatibility fix' : 'No Orders icon compatibility fix needed')
