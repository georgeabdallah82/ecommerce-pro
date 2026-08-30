import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const source = resolve('prisma/schema.prisma')
const target = resolve('.generated/schema.mongodb.prisma')

let schema = await readFile(source, 'utf8')

schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "mongodb"')
schema = schema.replace(/^([ \t]*id\s+String\s+@id\s+@default\(cuid\(\)\))(?!\s+@map\("_id"\))\s*$/gm, '$1 @map("_id")')

schema = schema.replace(/^(\s*)@@id\(\[([^\]]+)\]\)\s*$/gm, (_, indent, fields) => {
  return `${indent}id         String   @id @default(cuid()) @map("_id")\n${indent}@@unique([${fields}])`
})

if (schema.includes('@@id(')) {
  throw new Error('MongoDB schema preparation failed: composite @@id remains')
}

await mkdir(dirname(target), { recursive: true })
await writeFile(target, schema)
console.log(`[mongodb] prepared ${target}`)
