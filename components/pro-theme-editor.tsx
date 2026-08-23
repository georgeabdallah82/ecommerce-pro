'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, GripVertical, Monitor, Palette, Plus, Redo2, Save, Search, Settings2, Smartphone, Tablet, Trash2, Undo2, X } from 'lucide-react'
import StorefrontSections from '@/components/storefront-sections'
import { StoreNav } from '@/components/store-nav'
import { Footer } from '@/components/footer'
import { CartProvider } from '@/components/cart-provider'

type AnyMap = Record<string, any>
type NavItem = { id: string; label: string; url?: string | null; parentId?: string | null; children?: NavItem[] }
type Section = { id: string; type: string; enabled?: boolean; settings: AnyMap; blocks?: AnyMap[] }
type Product = { id: string; name: string; slug: string; basePrice: number; compareAtPrice?: number | null; images?: { url: string; alt?: string | null }[]; collections?: { collection?: { id: string; slug: string } }[] }
type Collection = { id: string; name: string; slug: string; description?: string | null; imageUrl?: string | null }
type Snapshot = { theme: AnyMap; templates: Record<string, Section[]> }
type Props = { initial: { theme: AnyMap; sections: Section[]; navigation: NavItem[] } }

const TEMPLATES = [
  { key: 'Home page', path: '/' }, { key: 'Products', path: '/shop' }, { key: 'Product', path: '/product/demo' },
  { key: 'Collections', path: '/collections' }, { key: 'Collection', path: '/collections/demo' }, { key: 'Cart', path: '/cart' },
  { key: 'Pages', path: '/about' }, { key: 'Blog', path: '/blog' },
]

const META: Record<string, { label: string; group: string }> = {
  announcement: { label: 'Announcement bar', group: 'Header' },
  header: { label: 'Header', group: 'Header' },
  hero: { label: 'Image banner', group: 'Hero & media' },
  slideshow: { label: 'Slideshow', group: 'Hero & media' },
  video: { label: 'Video', group: 'Hero & media' },
  image_with_text: { label: 'Image with text', group: 'Hero & media' },
  product_grid: { label: 'Featured collection', group: 'Products' },
  product_carousel: { label: 'Product carousel', group: 'Products' },
  featured_product: { label: 'Featured product', group: 'Products' },
  product_recommendations: { label: 'Product recommendations', group: 'Products' },
  main_product: { label: 'Main product', group: 'Products' },
  collection_grid: { label: 'Collection list', group: 'Collections' },
  collection_carousel: { label: 'Collection carousel', group: 'Collections' },
  main_collection_banner: { label: 'Collection banner', group: 'Collections' },
  main_collection_grid: { label: 'Collection products', group: 'Collections' },
  multicolumn: { label: 'Multicolumn', group: 'Content' },
  rich_text: { label: 'Rich text', group: 'Content' },
  testimonials: { label: 'Testimonials', group: 'Content' },
  logo_list: { label: 'Logo list', group: 'Content' },
  faq: { label: 'Collapsible content', group: 'Content' },
  newsletter: { label: 'Email signup', group: 'Content' },
  footer: { label: 'Footer', group: 'Footer' },
}

function clone<T>(value: T): T { return structuredClone(value) }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

function makeSection(type: string): Section {
  const common = { spacing: 72, contentWidth: 1180, animation: 'fade-up' }
  if (type === 'announcement') return { id: id(type), type, enabled: true, settings: { ...common, text: 'Free shipping on orders over $50', link: '', background: 'primary', textColor: '#ffffff', height: 40 } }
  if (type === 'hero') return { id: id(type), type, enabled: true, settings: { ...common, eyebrow: 'NEW COLLECTION', heading: 'Make your store impossible to ignore.', text: 'A premium storefront built for conversion.', buttonLabel: 'Shop now', buttonUrl: '/shop', secondaryLabel: 'Explore collections', secondaryUrl: '/collections', imageUrl: '', mobileImageUrl: '', imageAlt: '', imageHeightMode: 'adapt', minHeight: 640, imageFit: 'cover', focalX: 50, focalY: 50, overlay: .24, overlayColor: '#000000', overlayStyle: 'bottom-gradient', contentPosition: 'center-left', contentBox: false, textAlign: 'left', fullBleed: true } }
  if (type === 'product_grid' || type === 'product_carousel' || type === 'product_recommendations' || type === 'featured_product') return { id: id(type), type, enabled: true, settings: { ...common, heading: type === 'product_recommendations' ? 'You may also like' : type === 'featured_product' ? 'Featured product' : 'Featured products', subheading: 'Best sellers, new arrivals or a hand-picked edit.', limit: type === 'featured_product' ? 1 : 8, columns: type === 'featured_product' ? 1 : 4, showViewAll: true, collection: '' } }
  if (type === 'collection_grid' || type === 'collection_carousel') return { id: id(type), type, enabled: true, settings: { ...common, heading: 'Shop by collection', subheading: '', limit: 4, columns: 4, collectionIds: [] } }
  if (type === 'main_product') return { id: id(type), type, enabled: true, settings: { ...common, previewProductId: '', stickyAddToCart: true, showVendor: true, showReviews: true } }
  if (type === 'main_collection_banner') return { id: id(type), type, enabled: true, settings: { ...common, heading: 'Collection', subheading: '', imageUrl: '' } }
  if (type === 'main_collection_grid') return { id: id(type), type, enabled: true, settings: { ...common, heading: 'Products', limit: 24, columns: 4 } }
  if (type === 'image_with_text') return { id: id(type), type, enabled: true, settings: { ...common, eyebrow: 'THE BRAND', heading: 'Tell your story.', text: 'Combine imagery, copy and a strong call to action.', buttonLabel: 'Learn more', buttonUrl: '/about', imageUrl: '', layout: 'image-right' } }
  if (type === 'newsletter') return { id: id(type), type, enabled: true, settings: { ...common, heading: 'Stay in the loop', text: 'Get launches, drops and offers in your inbox.', buttonLabel: 'Subscribe', background: 'primary' } }
  if (type === 'rich_text' || type === 'main_collection') return { id: id(type), type, enabled: true, settings: { ...common, eyebrow: 'ABOUT THE BRAND', heading: 'Tell your story.', text: 'Use this space for your story or editorial content.' } }
  if (type === 'video') return { id: id(type), type, enabled: true, settings: { ...common, heading: 'Watch the story', text: '', imageUrl: '' } }
  if (type === 'footer') return { id: id(type), type, enabled: true, settings: { ...common, columns: 4, showNewsletter: true } }
  if (type === 'slideshow') return { id: id(type), type, enabled: true, settings: { ...common, heading: 'Featured', minHeight: 560 }, blocks: [1, 2].map(n => ({ id: id('slide'), type: 'slide', settings: { heading: `Slide ${n}`, text: 'Campaign message', buttonLabel: 'Shop now', buttonUrl: '/shop', imageUrl: '' } })) }
  return { id: id(type), type, enabled: true, settings: { ...common } }
}

function defaultTemplates(initialSections: Section[]): Record<string, Section[]> {
  return {
    'Home page': initialSections?.length ? clone(initialSections) : [makeSection('announcement'), makeSection('hero'), makeSection('product_grid'), makeSection('collection_grid'), makeSection('newsletter')],
    Products: [makeSection('announcement'), makeSection('product_grid'), makeSection('newsletter')],
    Product: [makeSection('announcement'), makeSection('main_product'), makeSection('product_recommendations'), makeSection('newsletter')],
    Collections: [makeSection('announcement'), makeSection('collection_grid'), makeSection('newsletter')],
    Collection: [makeSection('announcement'), makeSection('main_collection_banner'), makeSection('main_collection_grid'), makeSection('newsletter')],
    Cart: [makeSection('announcement'), makeSection('newsletter')],
    Pages: [makeSection('announcement'), makeSection('hero'), makeSection('rich_text'), makeSection('newsletter')],
    Blog: [makeSection('announcement'), makeSection('hero'), makeSection('collection_grid'), makeSection('newsletter')],
  }
}

const css = `
.focalEditor{position:fixed;inset:0;z-index:9999;display:grid;grid-template-rows:64px 1fr;background:#f6f7f7;color:#202223;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.focalTop{display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#fff;border-bottom:1px solid #e3e6e8}.focalTopLeft,.focalTopRight{display:flex;align-items:center;gap:9px}.focalBtn,.focalIcon{height:36px;padding:0 12px;border:1px solid #dfe3e6;background:#fff;border-radius:8px;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;cursor:pointer}.focalIcon{width:36px;padding:0;justify-content:center}.focalBtn.primary{background:#ff5a1f;border-color:#ff5a1f;color:#fff}.focalBody{display:grid;grid-template-columns:310px 1fr;min-height:0}.focalSide{background:#fff;border-right:1px solid #e3e6e8;overflow:auto}.focalTabs{display:grid;grid-template-columns:1fr 1fr;padding:8px;gap:6px}.focalTabs button{height:34px;border:0;border-radius:7px;background:transparent;font-size:10px;font-weight:800;cursor:pointer}.focalTabs button.active{background:#fff0eb;color:#ff5a1f}.focalRows{padding:8px}.focalRow{display:flex;margin:3px 0;border:1px solid transparent;border-radius:8px}.focalRow.active{background:#fff0eb;border-color:#ffd8ca}.focalRowMain{flex:1;border:0;background:transparent;padding:11px;text-align:left;cursor:pointer;display:flex;gap:8px;align-items:center;font-size:11px}.focalRowMain span{flex:1}.focalToggle{width:34px;border:0;background:transparent;cursor:pointer}.focalCanvas{min-width:0;display:flex;flex-direction:column;overflow:hidden}.focalCanvasTop{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #e3e6e8}.focalViewport{flex:1;overflow:auto;padding:20px}.focalFrame{margin:0 auto;background:#fff;min-height:100%;overflow:hidden;border:1px solid #dde1e3}.focalDrawer{position:absolute;top:64px;right:0;bottom:0;width:380px;background:#fff;border-left:1px solid #e3e6e8;z-index:30;overflow:auto}.focalDrawerHead{padding:14px;border-bottom:1px solid #e8eaec;display:flex;justify-content:space-between}.focalDrawerTabs{display:grid;grid-template-columns:repeat(3,1fr)}.focalDrawerTabs button{height:38px;border:0;background:#fff;border-bottom:2px solid transparent}.focalDrawerTabs button.active{border-bottom-color:#ff5a1f}.focalPanel{margin:12px;border:1px solid #e1e5e7;border-radius:10px;overflow:hidden}.focalPanelTitle{padding:11px 13px;font-size:11px;font-weight:800;border-bottom:1px solid #e8eaec}.focalPanelBody{padding:13px;display:grid;gap:10px}.focalField label{display:block;font-size:10px;font-weight:800;margin-bottom:5px}.focalInput,.focalSelect,.focalTextarea{width:100%;border:1px solid #dfe3e6;border-radius:8px;padding:8px 10px;font-size:11px}.focalTextarea{min-height:75px}.focalTwo{display:grid;grid-template-columns:1fr 1fr;gap:8px}.focalAdd{margin:8px 12px 14px;width:calc(100% - 24px);height:38px;border:1px dashed #c9ced2;background:#fff;border-radius:8px;font-size:11px;font-weight:800}.focalNotice{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);padding:10px 14px;border-radius:8px;background:#202223;color:#fff;font-size:11px;font-weight:800}.focalSearch{margin:12px}.focalSearch input{width:100%;height:36px;border:1px solid #dfe3e6;border-radius:8px;padding:0 10px}.focalSectionGroup{padding:0 12px 14px}.focalSectionGroup strong{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8a9096;margin:12px 0 6px}.focalSectionGroup button{width:100%;margin:3px 0;text-align:left}.focalCheck{display:flex;gap:8px;align-items:center;font-size:10px}.focalSectionHead{padding:12px;display:flex;justify-content:space-between;align-items:center}.focalSectionHead small{display:block;color:#8a9096;margin-top:3px;font-size:9px}
`

function Field({ label, value, onChange, type = 'text' }: { label: string; value: any; onChange: (v: any) => void; type?: string }) {
  return <div className="focalField"><label>{label}</label><input className="focalInput" type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} /></div>
}
function Textarea({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) { return <div className="focalField"><label>{label}</label><textarea className="focalTextarea" value={value ?? ''} onChange={e => onChange(e.target.value)} /></div> }
function Panel({ title, children }: { title: string; children: any }) { return <div className="focalPanel"><div className="focalPanelTitle">{title}</div><div className="focalPanelBody">{children}</div></div> }

export default function ProThemeEditor({ initial }: Props) {
  const base = useMemo(() => initial.theme?.editorTemplates && typeof initial.theme.editorTemplates === 'object' ? clone(initial.theme.editorTemplates) : defaultTemplates(initial.sections), [initial])
  const [theme, setTheme] = useState<AnyMap>(() => clone(initial.theme))
  const [templates, setTemplates] = useState<Record<string, Section[]>>(() => base)
  const [page, setPage] = useState('Home page')
  const [selectedId, setSelectedId] = useState('')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [tab, setTab] = useState<'sections' | 'theme'>('sections')
  const [drawerTab, setDrawerTab] = useState<'content' | 'design' | 'advanced'>('content')
  const [drawer, setDrawer] = useState(false)
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const current = templates[page] || []
  const selectedIndex = current.findIndex(s => s.id === selectedId)
  const selected = current[selectedIndex] || null

  useEffect(() => {
    if (!current.some(s => s.id === selectedId)) { setSelectedId(current[0]?.id || ''); setDrawer(false) }
  }, [current, selectedId])

  useEffect(() => {
    Promise.all([
      fetch('/api/products').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/collections').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([p, c]) => { setProducts(Array.isArray(p) ? p : []); setCollections(Array.isArray(c) ? c : []) })
  }, [])

  function commit(fn: (draft: Snapshot) => Snapshot) {
    const before = { theme: clone(theme), templates: clone(templates) }
    const after = fn(before)
    setHistory(h => [...h, { theme: clone(theme), templates: clone(templates) }].slice(-50))
    setFuture([])
    setTheme(after.theme)
    setTemplates(after.templates)
    setDirty(true)
  }

  function patchSelected(patch: AnyMap) {
    if (!selected) return
    commit(s => ({ ...s, templates: { ...s.templates, [page]: (s.templates[page] || []).map(x => x.id === selected.id ? { ...x, settings: { ...x.settings, ...patch } } : x) } }))
  }
  function setEnabled(value: boolean) {
    if (!selected) return
    commit(s => ({ ...s, templates: { ...s.templates, [page]: (s.templates[page] || []).map(x => x.id === selected.id ? { ...x, enabled: value } : x) } }))
  }
  function addSection(type: string) {
    const next = makeSection(type)
    commit(s => ({ ...s, templates: { ...s.templates, [page]: [...(s.templates[page] || []), next] } }))
    setSelectedId(next.id); setDrawer(true); setPicker(false)
  }
  function move(delta: number) {
    if (selectedIndex < 0) return
    const to = selectedIndex + delta
    if (to < 0 || to >= current.length) return
    commit(s => {
      const list = [...(s.templates[page] || [])]
      const [item] = list.splice(selectedIndex, 1)
      list.splice(to, 0, item)
      return { ...s, templates: { ...s.templates, [page]: list } }
    })
  }
  function duplicate() {
    if (!selected) return
    const copy = clone(selected)
    copy.id = id(copy.type)
    commit(s => { const list = [...(s.templates[page] || [])]; list.splice(selectedIndex + 1, 0, copy); return { ...s, templates: { ...s.templates, [page]: list } } })
    setSelectedId(copy.id)
  }
  function removeSection() {
    if (!selected) return
    commit(s => ({ ...s, templates: { ...s.templates, [page]: (s.templates[page] || []).filter(x => x.id !== selected.id) } }))
    setSelectedId(current[selectedIndex - 1]?.id || current[selectedIndex + 1]?.id || '')
    setDrawer(false)
  }
  function undo() {
    const prev = history.at(-1); if (!prev) return
    setFuture(f => [...f, { theme: clone(theme), templates: clone(templates) }]); setHistory(h => h.slice(0, -1)); setTheme(prev.theme); setTemplates(prev.templates); setDirty(true)
  }
  function redo() {
    const next = future.at(-1); if (!next) return
    setHistory(h => [...h, { theme: clone(theme), templates: clone(templates) }]); setFuture(f => f.slice(0, -1)); setTheme(next.theme); setTemplates(next.templates); setDirty(true)
  }
  async function save() {
    setSaving(true); setMessage('')
    try {
      const r = await fetch('/api/admin/theme', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: { ...theme, editorTemplates: templates }, sections: templates['Home page'] || [], navigation: initial.navigation }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Could not save theme')
      setTheme(data.theme || { ...theme, editorTemplates: templates }); setTemplates(data.theme?.editorTemplates || templates); setDirty(false); setMessage('Theme saved')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save theme') } finally { setSaving(false) }
  }

  const groups = Object.entries(META).filter(([key, meta]) => key !== 'header' && (!query || meta.label.toLowerCase().includes(query.toLowerCase()))).reduce<Record<string, [string, { label: string; group: string }][]>>((acc, pair) => { const g = pair[1].group; (acc[g] ||= []).push(pair); return acc }, {})
  const previewProduct = selected?.type === 'main_product' ? products.find(p => p.id === selected.settings?.previewProductId) || products[0] || null : null

  return <div className="focalEditor" style={{ ['--focal-primary' as any]: theme.colors?.primary || '#ff5a1f' }}>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <header className="focalTop">
      <div className="focalTopLeft"><a className="focalIcon" href="/admin/online-store"><ArrowLeft size={16} /></a><div><strong>Theme editor</strong><div style={{ fontSize: 9, color: '#8a9096' }}>ONLINE STORE</div></div></div>
      <div><select className="focalSelect" value={page} onChange={e => { setPage(e.target.value); setSelectedId(''); setDrawer(false) }}>{TEMPLATES.map(t => <option key={t.key}>{t.key}</option>)}</select></div>
      <div className="focalTopRight"><button className="focalIcon" onClick={undo} disabled={!history.length}><Undo2 size={15} /></button><button className="focalIcon" onClick={redo} disabled={!future.length}><Redo2 size={15} /></button><div className="focalTopRight">{(['desktop', 'tablet', 'mobile'] as const).map(d => <button key={d} className={`focalIcon ${device === d ? 'active' : ''}`} onClick={() => setDevice(d)}>{d === 'desktop' ? <Monitor size={14} /> : d === 'tablet' ? <Tablet size={14} /> : <Smartphone size={14} />}</button>)}</div><button className="focalBtn" onClick={() => window.open(TEMPLATES.find(t => t.key === page)?.path || '/', '_blank')}>Preview</button><button className="focalBtn primary" disabled={saving} onClick={save}><Save size={14} />{saving ? 'Saving...' : dirty ? 'Save •' : 'Save'}</button></div>
    </header>
    <div className="focalBody">
      <aside className="focalSide">
        <div className="focalTabs"><button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')}><GripVertical size={13} /> Sections</button><button className={tab === 'theme' ? 'active' : ''} onClick={() => setTab('theme')}><Palette size={13} /> Theme</button></div>
        {tab === 'sections' ? <>
          <div className="focalSectionHead"><div><strong>{page}</strong><small>{current.filter(s => s.enabled !== false).length} visible sections</small></div><button className="focalIcon" onClick={() => setPicker(true)}><Plus size={15} /></button></div>
          <div className="focalRows">{current.map((s, i) => <div key={s.id} className={`focalRow ${selectedId === s.id ? 'active' : ''}`}><button className="focalRowMain" onClick={() => { setSelectedId(s.id); setDrawer(true); setDrawerTab('content') }}><GripVertical size={13} /><span>{META[s.type]?.label || s.type}</span>{i === 0 && <small>MAIN</small>}</button><button className="focalToggle" onClick={() => setEnabled(s.enabled === false)}>{s.enabled === false ? <X size={14} /> : <Check size={14} />}</button></div>)}</div>
          <button className="focalAdd" onClick={() => setPicker(true)}><Plus size={14} /> Add section</button>
        </> : <ThemeSettings theme={theme} update={p => commit(s => ({ ...s, theme: { ...s.theme, ...p } }))} />}
      </aside>

      <main className="focalCanvas">
        <div className="focalCanvasTop"><strong>{page}</strong><span style={{ fontSize: 10, color: '#6e7479' }}>Live preview{dirty ? ' · unsaved changes' : ''}</span></div>
        <div className="focalViewport"><div className="focalFrame" style={{ width: device === 'mobile' ? 390 : device === 'tablet' ? 820 : '100%' }}><CartProvider><StoreNav theme={theme} navigation={initial.navigation} /><StorefrontSections theme={theme} sections={current} products={products} collections={collections} product={previewProduct} preview selectedId={selectedId} onSelect={id => { setSelectedId(id); setDrawer(true) }} /><Footer /></CartProvider></div></div>
      </main>

      {drawer && selected && <aside className="focalDrawer"><div className="focalDrawerHead"><div><strong>{META[selected.type]?.label || selected.type}</strong></div><div style={{ display: 'flex', gap: 4 }}><button className="focalIcon" onClick={() => move(-1)} disabled={selectedIndex <= 0}><ArrowUp size={13} /></button><button className="focalIcon" onClick={() => move(1)} disabled={selectedIndex >= current.length - 1}><ArrowDown size={13} /></button><button className="focalIcon" onClick={duplicate}><Copy size={13} /></button><button className="focalIcon" onClick={removeSection}><Trash2 size={13} /></button><button className="focalIcon" onClick={() => setDrawer(false)}><X size={13} /></button></div></div><div className="focalDrawerTabs">{(['content', 'design', 'advanced'] as const).map(t => <button className={drawerTab === t ? 'active' : ''} key={t} onClick={() => setDrawerTab(t)}>{t}</button>)}</div><div>{drawerTab === 'content' ? <ContentInspector section={selected} products={products} collections={collections} patch={patchSelected} /> : drawerTab === 'design' ? <DesignInspector section={selected} patch={patchSelected} theme={theme} /> : <AdvancedInspector section={selected} patch={patchSelected} setEnabled={setEnabled} />}</div></aside>}

      {picker && <div className="focalModal" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 60, display: 'grid', placeItems: 'center' }} onClick={() => setPicker(false)}><div style={{ width: 520, maxHeight: '80vh', overflow: 'auto', background: '#fff', borderRadius: 12, padding: 16 }} onClick={e => e.stopPropagation()}><div className="focalField"><label>Search sections</label><input className="focalInput" value={query} onChange={e => setQuery(e.target.value)} placeholder="Hero, product, collection..." /></div>{Object.entries(groups).map(([group, items]) => <div className="focalSectionGroup" key={group}><strong>{group}</strong>{items.map(([key, meta]) => <button key={key} className="focalBtn" onClick={() => addSection(key)}><Plus size={14} /> {meta.label}</button>)}</div>)}</div></div>}
      {message && <div className="focalNotice">{message}</div>}
    </div>
  </div>
}

function ContentInspector({ section, products, collections, patch }: { section: Section; products: Product[]; collections: Collection[]; patch: (p: AnyMap) => void }) {
  const s = section.settings || {}
  if (section.type === 'hero') return <><Panel title="Content"><Field label="Eyebrow" value={s.eyebrow} onChange={v => patch({ eyebrow: v })} /><Textarea label="Heading" value={s.heading} onChange={v => patch({ heading: v })} /><Textarea label="Text" value={s.text} onChange={v => patch({ text: v })} /><div className="focalTwo"><Field label="Button" value={s.buttonLabel} onChange={v => patch({ buttonLabel: v })} /><Field label="Button URL" value={s.buttonUrl} onChange={v => patch({ buttonUrl: v })} /></div></Panel><Panel title="Image"><Field label="Image URL" value={s.imageUrl} onChange={v => patch({ imageUrl: v })} /><Field label="Mobile image URL" value={s.mobileImageUrl} onChange={v => patch({ mobileImageUrl: v })} /><Field label="Alt text" value={s.imageAlt} onChange={v => patch({ imageAlt: v })} /></Panel></>
  if (['product_grid', 'product_carousel', 'featured_product', 'product_recommendations', 'main_collection_grid'].includes(section.type)) return <Panel title="Products"><Field label="Heading" value={s.heading} onChange={v => patch({ heading: v })} /><Field label="Count" type="number" value={s.limit || 8} onChange={v => patch({ limit: v })} /><Field label="Columns" type="number" value={s.columns || 4} onChange={v => patch({ columns: v })} /><select className="focalSelect" value={s.collection || ''} onChange={e => patch({ collection: e.target.value })}><option value="">All products</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Panel>
  if (section.type === 'collection_grid' || section.type === 'collection_carousel') return <Panel title="Collections"><Field label="Heading" value={s.heading} onChange={v => patch({ heading: v })} /><div className="focalTwo"><Field label="Count" type="number" value={s.limit || 4} onChange={v => patch({ limit: v })} /><Field label="Columns" type="number" value={s.columns || 4} onChange={v => patch({ columns: v })} /></div><div>{collections.map(c => { const active = (s.collectionIds || []).includes(c.id); return <button key={c.id} className="focalBtn" style={{ margin: '3px 0', width: '100%', justifyContent: 'space-between' }} onClick={() => patch({ collectionIds: active ? (s.collectionIds || []).filter((x: string) => x !== c.id) : [...(s.collectionIds || []), c.id] })}>{active ? '✓ ' : ''}{c.name}</button> })}</div></Panel>
  if (section.type === 'main_product') return <><Panel title="Preview product"><select className="focalSelect" value={s.previewProductId || ''} onChange={e => patch({ previewProductId: e.target.value })}><option value="">First active product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Panel><Panel title="Product options"><label className="focalCheck"><input type="checkbox" checked={s.stickyAddToCart !== false} onChange={e => patch({ stickyAddToCart: e.target.checked })} /> Sticky add to cart</label><label className="focalCheck"><input type="checkbox" checked={s.showVendor !== false} onChange={e => patch({ showVendor: e.target.checked })} /> Show vendor</label><label className="focalCheck"><input type="checkbox" checked={s.showReviews !== false} onChange={e => patch({ showReviews: e.target.checked })} /> Show reviews</label></Panel></>
  return <Panel title="Content"><Textarea label="Heading" value={s.heading} onChange={v => patch({ heading: v })} /><Textarea label="Text" value={s.text || s.subheading} onChange={v => patch({ text: v, subheading: v })} /></Panel>
}

function DesignInspector({ section, theme, patch }: { section: Section; theme: AnyMap; patch: (p: AnyMap) => void }) {
  const s = section.settings || {}
  return <><Panel title="Spacing"><Field label="Section spacing" type="number" value={s.spacing || 72} onChange={v => patch({ spacing: v })} /><Field label="Content width" type="number" value={s.contentWidth || 1180} onChange={v => patch({ contentWidth: v })} /></Panel><Panel title="Background"><select className="focalSelect" value={s.background || 'surface'} onChange={e => patch({ background: e.target.value })}><option value="surface">Surface</option><option value="primary">Primary orange</option><option value="secondary">Secondary</option><option value="dark">Dark</option><option value="gradient">Gradient</option></select><Field label="Text color" value={s.textColor || theme.colors?.text} onChange={v => patch({ textColor: v })} /></Panel>{section.type === 'hero' && <Panel title="Image behavior"><select className="focalSelect" value={s.imageHeightMode || 'adapt'} onChange={e => patch({ imageHeightMode: e.target.value })}><option value="adapt">Adapt to image</option><option value="fixed">Fixed height</option></select><Field label="Height" type="number" value={s.minHeight || 640} onChange={v => patch({ minHeight: v })} /><Field label="Focal X" type="number" value={s.focalX ?? 50} onChange={v => patch({ focalX: v })} /><Field label="Focal Y" type="number" value={s.focalY ?? 50} onChange={v => patch({ focalY: v })} /></Panel>}</>
}

function AdvancedInspector({ section, patch, setEnabled }: { section: Section; patch: (p: AnyMap) => void; setEnabled: (v: boolean) => void }) {
  const s = section.settings || {}
  return <><Panel title="Visibility"><label className="focalCheck"><input type="checkbox" checked={section.enabled !== false} onChange={e => setEnabled(e.target.checked)} /> Show this section</label></Panel><Panel title="Animation"><select className="focalSelect" value={s.animation || 'fade-up'} onChange={e => patch({ animation: e.target.value })}><option value="none">None</option><option value="fade-up">Fade up</option><option value="fade">Fade</option><option value="zoom">Zoom</option></select></Panel><Panel title="Custom CSS"><Field label="CSS class" value={s.cssClass || ''} onChange={v => patch({ cssClass: v })} /></Panel></>
}

function ThemeSettings({ theme, update }: { theme: AnyMap; update: (patch: AnyMap) => void }) {
  const colors = theme.colors || {}
  return <div><Panel title="Brand"><Field label="Brand name" value={theme.brandName} onChange={v => update({ brandName: v })} /><Field label="Logo URL" value={theme.logoUrl || ''} onChange={v => update({ logoUrl: v })} /><Field label="Favicon URL" value={theme.faviconUrl || ''} onChange={v => update({ faviconUrl: v })} /></Panel><Panel title="Palette"><Field label="Primary orange" value={colors.primary} onChange={v => update({ colors: { ...colors, primary: v } })} /><Field label="Secondary" value={colors.secondary} onChange={v => update({ colors: { ...colors, secondary: v } })} /><Field label="Background" value={colors.background} onChange={v => update({ colors: { ...colors, background: v } })} /><Field label="Text" value={colors.text} onChange={v => update({ colors: { ...colors, text: v } })} /><Field label="Border" value={colors.border} onChange={v => update({ colors: { ...colors, border: v } })} /></Panel></div>
}
