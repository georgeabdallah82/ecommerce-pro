import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const root = process.cwd()
const apiRoot = join(root, 'app', 'api', 'admin')

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else if (extname(entry.name) === '.ts' || extname(entry.name) === '.tsx') out.push(full)
  }
  return out
}

const files = await walk(apiRoot)
const failures = []
const warnings = []

for (const file of files) {
  const text = await readFile(file, 'utf8')
  const relative = file.slice(root.length + 1).replaceAll('\\', '/')
  const mutates = /export async function (POST|PATCH|PUT|DELETE)\b/.test(text)
  const protectedRoute = /requirePermission\(|hasPermission\(/.test(text)
  if (mutates && !protectedRoute) failures.push(`${relative}: mutation route has no permission guard`)
  if (mutates && !/audit\(/.test(text) && !relative.includes('/notifications/')) warnings.push(`${relative}: mutation route has no visible audit() call`)
  if (/TODO|FIXME|COMING SOON|not implemented/i.test(text)) warnings.push(`${relative}: contains a TODO/placeholder marker`)
}

const env = await readFile(join(root, '.env.example'), 'utf8').catch(() => '')
for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'NEXT_PUBLIC_SITE_URL']) {
  if (!env.includes(`${key}=`)) warnings.push(`.env.example: missing ${key}`)
}

console.log(`Backend audit: ${files.length} admin API files scanned.`)
for (const warning of warnings) console.log(`WARN  ${warning}`)
for (const failure of failures) console.error(`FAIL  ${failure}`)
if (failures.length) process.exit(1)
console.log('Backend audit passed.')
