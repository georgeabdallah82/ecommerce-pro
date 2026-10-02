import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

// The editor preview must show what the live site shows. These guard the causes of past mismatches.
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function files(dir: string, out: string[] = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory()) { if (name !== 'admin' && !name.startsWith('zz-')) files(rel, out); continue }
    if (/\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}

describe('editor preview matches the live site', () => {
  it('renders sections without preview-only CSS', () => {
    // A <style> emitted only in preview mode restyled sections (e.g. cropped the featured
    // product image) so they looked different in the editor than on the store.
    assert.doesNotMatch(read('components/storefront-sections.tsx'), /preview&&<style/)
  })

  it('storefront product queries order images the way the preview data does', () => {
    // images: true returns rows in database order, so reordering a product's images changed
    // the preview (sorted) but not the live card. Order by sortOrder everywhere.
    const offenders = [...files('app'), ...files('lib')]
      .filter(file => !file.startsWith('app/api/'))
      .filter(file => /images: ?true/.test(read(file)))
    assert.deepEqual(offenders, [])
  })

  it('the studio only previews active collections, like the live queries', () => {
    assert.match(read('components/theme-studio.tsx'), /isActive !== false/)
  })
})
