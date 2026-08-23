import fs from 'node:fs'

const path = 'components/pro-theme-editor.tsx'
let source = fs.readFileSync(path, 'utf8')

const bad = '<DesignInspector section={selected} theme={theme} patch={patch}/>'
const good = '<DesignInspector section={selected} patch={patch}/>'

if (source.includes(bad)) {
  source = source.replace(bad, good)
  fs.writeFileSync(path, source)
  console.log('Applied DesignInspector prop compatibility fix')
} else {
  console.log('No DesignInspector compatibility fix needed')
}
