import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

function safeFilename(name: string) {
  const ext = (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

export async function storeMediaLocally(file: File) {
  const filename = safeFilename(file.name)
  const key = `uploads/${filename}`
  const body = await file.arrayBuffer()
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), Buffer.from(body))
  return { key, url: `/uploads/${filename}` }
}
