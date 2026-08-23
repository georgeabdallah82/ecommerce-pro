import fs from 'node:fs'

const editorPath='components/pro-theme-editor.tsx'
let s=fs.readFileSync(editorPath,'utf8')

const patches=[
  [
    "import React, { useEffect, useMemo, useState } from 'react'",
    "import React, { useEffect, useMemo, useState } from 'react'\nimport StorefrontSections from '@/components/storefront-sections'"
  ],
  [
    "function Inspector({ section, tab, update, addBlock, patchBlock, removeBlock, chooseAsset, collections }: { section: Section; tab: DrawerTab; update: (p: AnyMap) => void; addBlock: (type: string) => void; patchBlock: (id: string, p: AnyMap) => void; removeBlock: (id: string) => void; chooseAsset: (target: MediaTarget) => void; collections: CatalogCollection[] }) {",
    "function Inspector({ section, tab, update, addBlock, patchBlock, removeBlock, chooseAsset, collections, products }: { section: Section; tab: DrawerTab; update: (p: AnyMap) => void; addBlock: (type: string) => void; patchBlock: (id: string, p: AnyMap) => void; removeBlock: (id: string) => void; chooseAsset: (target: MediaTarget) => void; collections: CatalogCollection[]; products: CatalogProduct[] }) {"
  ],
  [
    "{section.type === 'main_product' && <Panel title=\"Main product\"><Field label=\"Preview product ID\" value={s.previewProductId || ''} onChange={v => update({previewProductId:v})}/><div className=\"pteMini\">The live product page uses the current product automatically. The preview uses the first active product when this is empty.</div></Panel>}",
    "{section.type === 'main_product' && <Panel title=\"Main product\"><Select label=\"Preview product\" value={s.previewProductId || ''} options={[{value:'',label:'First active product'}, ...products.map(p=>({value:p.id,label:p.name}))]} onChange={v => update({previewProductId:v})}/><div className=\"pteMini\">Preview selection only; the live storefront uses the product being viewed.</div></Panel>}"
  ],
  [
    "<Inspector section={selected} tab={drawerTab} update={updateSection} addBlock={addBlock} patchBlock={patchBlock} removeBlock={removeBlock} chooseAsset={chooseAsset} collections={collections}/>",
    "<Inspector section={selected} tab={drawerTab} update={updateSection} addBlock={addBlock} patchBlock={patchBlock} removeBlock={removeBlock} chooseAsset={chooseAsset} collections={collections} products={products}/>"
  ],
]

for (const [from,to] of patches) {
  if (s.includes(from)) s=s.replace(from,to)
}

const oldCollectionHelp='<div className="pteMini">For a Collection List, choose a source to show that collection first. For the Collection template, choose the current collection from the template preview.</div></Panel>}'
const newCollectionHelp='<div className="pteField"><span>Selected collections</span><div style={{display:\'grid\',gap:6}}>{collections.map(c=>{const ids=Array.isArray(s.collectionIds)?s.collectionIds:[];const checked=ids.includes(c.id)||ids.includes(c.slug);return <button type="button" key={c.id} onClick={()=>update({collectionIds:checked?ids.filter((x:any)=>x!==c.id&&x!==c.slug):[...ids,c.id]})} style={{border:\'1px solid #dfe3e6\',background:checked?\'var(--accent-soft)\':\'#fff\',borderRadius:7,padding:\'8px 9px\',textAlign:\'left\',fontSize:10,cursor:\'pointer\'}}>{checked?\'✓ \':\'\'}{c.name}</button>})}</div></div><div className="pteMini">Select one or more real collections. Leaving this empty shows all active collections.</div></Panel>}'
if (s.includes(oldCollectionHelp)) s=s.replace(oldCollectionHelp,newCollectionHelp)

s=s.replace(
  "if (section.type.includes('collection')) { const items = collections.slice(0, Number(s.limit || 4));",
  "if (section.type.includes('collection')) { const selectedCollections=s.collectionIds?.length?collections.filter(c=>s.collectionIds.includes(c.id)||s.collectionIds.includes(c.slug)):s.sourceCollection?collections.filter(c=>c.slug===s.sourceCollection||c.id===s.sourceCollection):collections; const items=selectedCollections.slice(0,Number(s.limit||4));"
)

const previewStart=s.indexOf('function PreviewSection(')
const panelStart=s.indexOf('\nfunction Panel(', previewStart)
if (previewStart>=0 && panelStart>previewStart) {
  const replacement=`function PreviewSection({ section, theme, products, collections }: { section: Section; theme: Theme; products: CatalogProduct[]; collections: CatalogCollection[]; selected?: boolean; onSelect?: () => void }) {\n  return <StorefrontSections theme={theme} sections={[section]} products={products} collections={collections} preview />\n}\n`
  s=s.slice(0,previewStart)+replacement+s.slice(panelStart+1)
}

if (!s.includes("import StorefrontSections from '@/components/storefront-sections'")) throw new Error('Shared storefront renderer import did not apply')
if (!s.includes('return <StorefrontSections theme={theme} sections={[section]}')) throw new Error('Shared storefront renderer patch did not apply')
if (!s.includes('collections, products }: { section: Section')) throw new Error('Theme Editor Inspector patch did not apply')
if (!s.includes('Selected collections')) throw new Error('Collection selector patch did not apply')
if (!s.includes('options={[{value:\'\',label:\'First active product\'}')) throw new Error('Product selector patch did not apply')
fs.writeFileSync(editorPath,s)

const storefrontPath='components/storefront-sections.tsx'
let st=fs.readFileSync(storefrontPath,'utf8')
st=st.replace("import { ProductCard } from '@/components/product-card'\n",'')
st=st.replace("import { Footer } from '@/components/footer'\n",'')
st=st.replace(/<ProductCard key=\{p\.id\} p=\{p\} \/>/g, '<Link className="card productCard" href={"/product/"+p.slug}><img className="productImage" src={p.images?.[0]?.url||\'/placeholder-product.svg\'} alt={p.images?.[0]?.alt||p.name}/><div className="productBody"><span className="muted" style={{fontSize:12}}>{p.category?.name||\'Collection\'}</span><div className="productName">{p.name}</div><div className="price">{(Number(p.basePrice||0)/100).toFixed(2)}</div></div></Link>')
st=st.replace(/\n\s*!preview && !hasFooter && <Footer \/>\n/, '\n')
// Fix the newsletter branch left with an extra closing brace by earlier automated edits.
st=st.replace(/(if\(section\.type==='newsletter'[^\n]*<\/section>)\}/, '$1')
fs.writeFileSync(storefrontPath,st)

console.log('Theme Editor patches applied')
