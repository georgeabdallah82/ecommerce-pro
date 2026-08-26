import fs from 'node:fs'

const checks = [
  ['components/storefront-sections.tsx', [
    'Array.isArray(p.variants)&&p.variants.length>0',
    'onQuickView(p)',
  ]],
  ['components/storefront-sections.tsx', [
    'setSelectedVariantId(product?.variants?.[0]?.id||null)',
    'setQty(1)',
  ]],
  ['components/storefront-sections.tsx', [
    "s.type==='footer'&&s.enabled!==false&&s.settings?.enabled!==false",
  ]],
  ['components/inventory-admin-pro.tsx', [
    'disabled={availability(r).available <= 0}',
  ]],
  ['components/live-storefront-sections.tsx', [
    'window.setInterval(load, 15000)',
  ]],
  ['components/focal-theme-editor.tsx', [
    "!['announcement','header'].includes(key)",
    'You have unsaved changes. Switch templates anyway?',
  ]],
  ['components/orders-admin-shopify.tsx', [
    "if(['CANCELLED','REFUNDED'].includes(o.status))return sum",
  ]],
]

const missing = []
for (const [file, needles] of checks) {
  if (!fs.existsSync(file)) { missing.push(`${file}: file missing`); continue }
  const source = fs.readFileSync(file, 'utf8')
  for (const needle of needles) {
    if (!source.includes(needle)) missing.push(`${file}: expected finalization behavior not present: ${needle}`)
  }
}

if (missing.length) {
  console.error('Finalization verification failed:')
  for (const item of missing) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`Finalization verification passed: ${checks.length} critical areas verified`)
