import fs from 'node:fs'

const checks = [
  ['components/storefront-sections.tsx', source => source.includes('const quickAdd=') && source.includes('p.variants') && source.includes('onQuickView(p)')],
  ['components/storefront-sections.tsx', source => source.includes('setSelectedVariantId(product?.variants?.[0]?.id||null)') && source.includes('setQty(1)')],
  ['components/storefront-sections.tsx', source => source.includes("s.type==='footer'&&s.enabled!==false")],
  ['components/inventory-admin-pro.tsx', source => source.includes('disabled={availability(r).available <= 0}')],
  ['components/live-storefront-sections.tsx', source => source.includes('window.setInterval(load, 15000)')],
  ['components/focal-theme-editor.tsx', source => source.includes("!['announcement','header'].includes(key)") && source.includes('You have unsaved changes. Switch templates anyway?') && source.includes('const changePage = (nextPage:string)')],
  ['components/orders-admin-shopify.tsx', source => source.includes("if(['CANCELLED','REFUNDED'].includes(o.status))return sum")],
]

const missing = []
for (const [file, check] of checks) {
  if (!fs.existsSync(file)) { missing.push(`${file}: file missing`); continue }
  const source = fs.readFileSync(file, 'utf8')
  let ok = false
  try { ok = Boolean(check(source)) } catch {}
  if (!ok) missing.push(`${file}: expected finalization behavior not present`)
}

if (missing.length) {
  console.error('Finalization verification failed:')
  for (const item of missing) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`Finalization verification passed: ${checks.length} critical areas verified`)
