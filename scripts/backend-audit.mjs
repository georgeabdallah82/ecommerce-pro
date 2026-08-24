import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const root = process.cwd()
const adminApiRoot = join(root, 'app', 'api', 'admin')
const apiRoot = join(root, 'app', 'api')

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else if (extname(entry.name) === '.ts' || extname(entry.name) === '.tsx') out.push(full)
  }
  return out
}

const adminFiles = await walk(adminApiRoot)
const apiFiles = await walk(apiRoot)
const failures = []
const warnings = []

for (const file of adminFiles) {
  const text = await readFile(file, 'utf8')
  const relative = file.slice(root.length + 1).replaceAll('\\', '/')
  const mutates = /export async function (POST|PATCH|PUT|DELETE)\b/.test(text)
  const protectedRoute = /requirePermission\(|hasPermission\(/.test(text)
  if (mutates && !protectedRoute) failures.push(`${relative}: mutation route has no permission guard`)
  if (mutates && !/audit\(/.test(text) && !relative.includes('/notifications/')) warnings.push(`${relative}: mutation route has no visible audit() call`)
  if (/TODO|FIXME|COMING SOON|not implemented/i.test(text)) warnings.push(`${relative}: contains a TODO/placeholder marker`)
}

for (const file of apiFiles) {
  const text = await readFile(file, 'utf8')
  const relative = file.slice(root.length + 1).replaceAll('\\', '/')
  if (relative.includes('/internal/payment-status/') && !/PAYMENT_WEBHOOK_SECRET/.test(text)) failures.push(`${relative}: internal payment webhook does not reference PAYMENT_WEBHOOK_SECRET`)
  if (relative.includes('/checkout/') && /await\s+sendNewOrderPush\(/.test(text)) failures.push(`${relative}: checkout awaits push notification and can let push failure affect order response`)
  if (relative.includes('/orders/manual/') && /await\s+sendNewOrderPush\(/.test(text)) failures.push(`${relative}: manual order awaits push notification and can let push failure affect order response`)
}

const env = await readFile(join(root, '.env.example'), 'utf8').catch(() => '')
for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PAYMENT_WEBHOOK_SECRET', 'NODE_VERSION']) {
  if (!env.includes(`${key}=`)) warnings.push(`.env.example: missing ${key}`)
}

const packageJson = await readFile(join(root, 'package.json'), 'utf8').catch(() => '')
if (!/"backend:audit"\s*:/.test(packageJson)) warnings.push('package.json: backend:audit script is not registered')

console.log(`Backend audit: ${adminFiles.length} admin API files scanned; ${apiFiles.length} total API files scanned.`)
for (const warning of warnings) console.log(`WARN  ${warning}`)
for (const failure of failures) console.error(`FAIL  ${failure}`)
if (failures.length) process.exit(1)
console.log('Backend audit passed.')
