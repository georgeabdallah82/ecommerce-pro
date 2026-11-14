import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { channelsShowing, parseOptionValues, pricingSummary, productViewCounts, tagsFromInput, withChannelOptOuts } from '@/lib/product-editor'

// Admin > Products: the product editor and the products list (docs/admin-product-editor-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const editor = read('components/product-editor-v2.tsx')
const editorCss = read('components/admin-product-editor.module.css')
const list = read('components/admin-products-list.tsx')

describe('option values', () => {
  it('reads "S, M, L" as three values, dropping blanks and repeats', () => {
    assert.deepEqual(parseOptionValues('S, M, L'), ['S', 'M', 'L'])
    assert.deepEqual(parseOptionValues('S,'), ['S'])
    assert.deepEqual(parseOptionValues(' S ,, M , s'), ['S', 'M'])
    assert.deepEqual(parseOptionValues(''), [])
  })
  it('the values box keeps what was typed (a parsed list dropped each comma as it was typed: "SML")', () => {
    assert.match(editor, /value=\{optionText\[i\] \|\| ''\} onChange=\{e => \{ const a = \[\.\.\.optionText\]; a\[i\] = e\.target\.value; setOptionText\(a\)/)
    assert.match(editor, /const optionValues = useMemo\(\(\) => optionText\.map\(parseOptionValues\), \[optionText\]\)/)
  })
})

describe('tags', () => {
  it('adds each comma-separated tag once, skipping ones the product has', () => {
    assert.deepEqual(tagsFromInput('summer, gift', ['Gift']), ['summer'])
    assert.deepEqual(tagsFromInput(' , Summer, summer', []), ['Summer'])
  })
  it('the box is labelled "Tags" and each tag has a named remove button', () => {
    assert.match(editor, /<label htmlFor="product-tags">Tags<\/label>/)
    assert.match(editor, /aria-label=\{`Remove tag \$\{tagName\(t\)\}`\}/)
    assert.doesNotMatch(editor, /<Field label="Tags">/)
  })
})

describe('margin and profit', () => {
  it('per item, negative below cost (it showed 0%)', () => {
    assert.deepEqual(pricingSummary(3900, 1200), { profit: 2700, margin: 69 })
    assert.deepEqual(pricingSummary(3900, 5000), { profit: -1100, margin: -28 })
    assert.equal(pricingSummary(3900, null), null)
    assert.equal(pricingSummary(0, 1200), null)
  })
  it('the editor says when a sale loses money', () => {
    assert.match(editor, /The price is below the cost per item: each sale loses \{money\(-pricing\.profit\)\}\./)
    assert.doesNotMatch(editor, /Math\.max\(0, Math\.round\(\(1 - product\.costPrice/)
  })
})

describe('sales channels', () => {
  const channels = [{ id: 'web', name: 'Online Store' }, { id: 'ig', name: 'Instagram Shop' }]
  it('a product is on every active channel unless it was taken off one', () => {
    assert.deepEqual(channelsShowing(channels, []).map(c => c.id), ['web', 'ig'])
    assert.deepEqual(channelsShowing(channels, [{ channelId: 'ig', available: false }]).map(c => c.id), ['web'])
    assert.deepEqual(channelsShowing(channels, [{ channelId: 'web', available: true }]).map(c => c.id), ['web', 'ig'])
  })
  it('the readiness strip counts channels that way (it warned on every product never changed there)', () => {
    assert.match(editor, /publishedChannels: creating \? 1 : channelsShowing\(channels \|\| \[\], productPublications\)\.length/)
  })
  it('the list shows each product\'s channels (every row said "Online Store")', () => {
    const rows = withChannelOptOuts([{ id: 'a' }, { id: 'b' }], [{ productId: 'b', channelId: 'web' }])
    assert.deepEqual(rows, [{ id: 'a', publications: [] }, { id: 'b', publications: [{ channelId: 'web', available: false }] }])
    assert.match(list, /<td data-cell="hide">\{channelCell\(product\)\}<\/td>/)
    assert.doesNotMatch(list, /<span className=\{styles\.channel\}>Online Store<\/span><\/td>/)
  })
})

describe('the list\'s view counts', () => {
  it('counts every view for the search, whichever view is open', async () => {
    const seen: unknown[] = []
    const counts = await productViewCounts(async ({ where }) => { seen.push(where); return ({ ACTIVE: 5, DRAFT: 1 } as Record<string, number>)[String(where.status)] ?? 7 }, { OR: [] })
    assert.deepEqual(counts, { ALL: 7, ACTIVE: 5, DRAFT: 1, ARCHIVED: 1 })
    assert.deepEqual(seen, [{ OR: [] }, { OR: [], status: 'ACTIVE' }, { OR: [], status: 'DRAFT' }])
  })
  it('the list reads them instead of counting the rows on screen', () => {
    assert.match(list, /counts \? counts\[value\]/)
    assert.doesNotMatch(list, /rows\.filter\(product => product\.status === 'DRAFT'\)\.length/)
    assert.match(read('app/api/admin/products/route.ts'), /productViewCounts\(args => db\.product\.count\(args as any\), search\)/)
    assert.match(read('app/admin/products/page.tsx'), /productViewCounts\(args => db\.product\.count\(args as any\)\)/)
  })
  it('the first page is not asked for again when the list opens', () => {
    assert.match(list, /if \(firstRun\.current\) \{ firstRun\.current = false; return \}/)
  })
})

describe('the editor\'s page structure', () => {
  it('has no second <main> inside the admin layout\'s', () => {
    assert.doesNotMatch(editor, /<main className=|<\/main>/)
    assert.match(editor, /role="tabpanel" id="product-panel"/)
  })
  it('the sections are tabs that say which one is open, with arrow keys', () => {
    assert.match(editor, /role="tablist" aria-label="Product sections" onKeyDown=\{onTabKey\}/)
    assert.match(editor, /role="tab" id=\{`product-tab-\$\{i\}`\} aria-selected=\{tab === t\}/)
    assert.match(editor, /event\.key === 'ArrowRight' \? at \+ 1/)
  })
  it('cards are h2s under the h1', () => {
    assert.match(editor, /<h2>\{title\}<\/h2>/)
    assert.match(editorCss, /\.cardHead h2 \{/)
  })
  it('the unsaved-changes bar and the tabs stay in view together below the app\'s top bar', () => {
    assert.match(editorCss, /\.stickyBand \{\n  position: sticky;\n  top: var\(--admin-topbar-h\);/)
    assert.doesNotMatch(editorCss, /\.topbar \{\n  position: sticky;/)
    assert.match(editor, /<div className=\{s\.stickyBand\}>\n\s+<UnsavedBar dirty=\{dirty \|\| !!saveError\}[^\n]*error=\{saveError\}/)
  })
  it('on narrow screens, bars stick right under the 58px top bar (at 64px the page showed through a 6px strip)', () => {
    assert.match(read('components/admin-nav.module.css'), /@media \(max-width: 900px\) \{\n[^}]*:root \{ --admin-topbar-h: 58px; \}/)
  })
  it('a money field shows focus on its whole box', () => {
    assert.match(editorCss, /\.moneyInput:focus-within \{ border-color: var\(--admin-accent\); box-shadow: 0 0 0 3px var\(--admin-focus\); \}/)
    assert.match(editor, /<span aria-hidden="true">\$<\/span>/)
  })
})

describe('the editor\'s fields and buttons have names', () => {
  it('variant boxes and remove buttons', () => {
    for (const name of ['`Variant ${i + 1} name`', '`${label} SKU`', '`${label} price`', '`${label} stock`', '`Remove variant ${label}`']) assert.ok(editor.includes(`aria-label={${name}}`), name)
  })
  it('option boxes, images, the description and the size guide', () => {
    for (const text of ['aria-label={`Option ${i + 1} values`}', 'aria-label={`Remove option ${i + 1}`}', 'role="group" aria-label={`Image ${i + 1}`}', 'aria-label="Move earlier"', 'label="Description"', 'aria-describedby="product-size-guide-help"']) assert.ok(editor.includes(text), text)
  })
  it('the collections search is labelled and keeps its list open for the keyboard', () => {
    assert.match(editor, /<label htmlFor="product-collections">Collections<\/label>/)
    assert.match(editor, /onBlur=\{event => \{ if \(!wrap\.current\?\.contains\(event\.relatedTarget as Node \| null\)\) setOpen\(false\) \}\}/)
    assert.doesNotMatch(editor, /setTimeout\(\(\) => setOpen\(false\), 150\)/)
  })
})

describe('saving, discarding and duplicating', () => {
  it('Discard goes back to the product as last saved', () => {
    assert.match(editor, /setProduct\(data\.product\); setSaved\(data\.product\)/)
    assert.match(editor, /function discard\(\) \{\n\s+setProduct\(saved\)/)
  })
  it('a save problem is said in the bar, with its field focused', () => {
    assert.match(editor, /return saveProblem\('SKU is required', 'Inventory', 'product-sku'\)/)
    assert.match(editor, /catch \(e\) \{ setSaveError\(e instanceof Error \? e\.message : 'Unable to save'\) \}/)
  })
  it('Duplicate asks first with unsaved changes, then opens the copy without the leave warning', () => {
    assert.match(editor, /if \(dirty && !\(await confirm\(\{ title: 'Duplicate without your changes\?'/)
    assert.match(editor, /allowLeave\(\)\n\s+window\.location\.href = `\/admin\/products\/\$\{data\.product\.id\}`/)
  })
  it('the product can be featured from the editor', () => {
    assert.match(editor, /<Check checked=\{product\.featured\} onChange=\{v => update\(\{ featured: v \}\)\} title="Featured"/)
  })
})

describe('the products list', () => {
  it('its menus are the shared keyboard menu', () => {
    assert.equal((list.match(/<AdminMenu /g) || []).length, 2)
    assert.doesNotMatch(list, /bulkOpen|toolsOpen/)
  })
  it('says results out loud, names statuses and its last column', () => {
    assert.match(list, /role="alert">\{error\}/)
    assert.match(list, /role="status">\{notice\}/)
    assert.match(list, /\{STATUS_LABEL\[product\.status\] \|\| product\.status\}/)
    assert.match(list, /<th className=\{styles\.openHead\}><span className=\{styles\.srOnly\}>Open<\/span><\/th>/)
  })
})
