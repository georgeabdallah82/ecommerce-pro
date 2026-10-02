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

  it('loads the studio data through the storefront queries and never hides a failed load', () => {
    const studio = read('components/theme-studio.tsx')
    assert.match(studio, /\/api\/admin\/theme\/preview-data/)
    // `.then(r => (r.ok ? r.json() : []))` on the products / collections requests turned a
    // failed load into "you have no products / collections".
    assert.doesNotMatch(studio, /fetch\('\/api\/(products|admin\/collections)'[^)]*\)\.then\(r => \(r\.ok \? r\.json\(\) : \[\]\)\)/)
    assert.match(read('app/api/admin/theme/preview-data/route.ts'), /loadZoneData/)
  })
})

describe('section text alignment', () => {
  it('the storefront acts on the setting for every section that offers it', () => {
    const renderer = read('components/storefront-sections.tsx')
    const css = read('app/storefront-legacy.css')
    // Headings used to ignore it (the heading box shrink-wraps its text), so the setting looked dead.
    for (const selector of ['.align-center .focalSectionHead', '.align-center .aliSectionHead', '.aliFlash.align-center', '.align-center .focalNewsletter']) {
      assert.ok(css.includes(selector), `storefront-legacy.css has no rule for ${selector}`)
    }
    for (const marker of ["aliSection${alignClass(s)}", "aliFlash${alignClass(s)}", "${s.fullBleed===false?'contained':''}${alignClass(s)}"]) {
      assert.ok(renderer.includes(marker), `storefront-sections.tsx does not apply the alignment class: ${marker}`)
    }
  })

  it('section width, section position and card position are wired from the setting to the CSS', () => {
    const renderer = read('components/storefront-sections.tsx')
    const css = read('app/storefront-legacy.css')
    const panels = read('components/theme-section-inspector.tsx')
    for (const key of ["'blockAlign'", "'sectionWidth'", "'sectionPosition'"]) assert.ok(panels.includes(key), `no studio control for ${key}`)
    for (const marker of ['block-center', 'block-right', 'has-sec-w', 'sec-${', "'--sec-w'"]) assert.ok(renderer.includes(marker), `renderer never emits ${marker}`)
    for (const selector of ['.has-sec-w .focalContainer', '.has-sec-w.sec-left', '.has-sec-w.sec-right', '.block-center .focalProductGrid', '.block-right .focalProductGrid', '.block-center .aliDenseGrid', '.focalType-collection_grid.block-center']) assert.ok(css.includes(selector), `no CSS for ${selector}`)
  })
})

describe('sections never silently disappear', () => {
  it('every section that can render nothing shows an editor notice instead', () => {
    const renderer = read('components/storefront-sections.tsx')
    // Each data-dependent `return null` must be `return preview ? <EmptySectionNotice/> : null`.
    const bare = [...renderer.matchAll(/if\(!(?:collections|newArrivals|sold|bars|items|discounted)\.length\)return null/g)].map(m => m[0])
    assert.deepEqual(bare, [])
    for (const name of ['Category strip', 'New arrivals', 'Best sellers', 'Flash deals', 'Announcement strip', 'Trust strip']) {
      assert.ok(renderer.includes(`name="${name}"`) || renderer.includes(`name={'${name}'}`), `no editor notice for ${name}`)
    }
  })

  it('the studio does not re-add content sections the merchant deleted', () => {
    const studio = read('components/theme-studio.tsx')
    assert.match(studio, /for \(const type of \['header', 'announcement'\]\) if \(!present\.has\(type\)\)/)
  })
})
