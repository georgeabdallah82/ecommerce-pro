'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, GripVertical, Image as ImageIcon, Monitor, Palette, Plus, Redo2, Save, Search, Settings2, Smartphone, Tablet, Trash2, Undo2, X } from 'lucide-react'
import StorefrontSections from '@/components/storefront-sections'
import styles from './shopify-theme-editor-v3.module.css'

type Section = { id: string; type: string; enabled?: boolean; settings?: Record<string, any>; blocks?: any[] }
type Theme = Record<string, any>
type Snapshot = { theme: Theme; template: string; sections: Section[]; navigation: any[] }

const TEMPLATES = ['Home page', 'Products', 'Product', 'Collections', 'Collection', 'Cart', 'Pages', 'Blog']
const META: Record<string, { label: string; category: string; description: string }> = {
  hero: { label: 'Image banner', category: 'Hero & media', description: 'Large visual banner with copy and calls to action.' }, slideshow: { label: 'Slideshow', category: 'Hero & media', description: 'Rotating campaign slides.' }, video: { label: 'Video', category: 'Hero & media', description: 'Video or poster image section.' }, image_with_text: { label: 'Image with text', category: 'Hero & media', description: 'Split editorial image and content.' }, product_grid: { label: 'Featured collection', category: 'Products', description: 'Show products in a curated grid.' }, product_carousel: { label: 'Featured collection carousel', category: 'Products', description: 'Scrollable product collection.' }, featured_product: { label: 'Featured product', category: 'Products', description: 'Highlight one product.' }, product_recommendations: { label: 'Product recommendations', category: 'Products', description: 'Related products on product pages.' }, collection_grid: { label: 'Collection list', category: 'Collections', description: 'Visual collection cards.' }, collection_carousel: { label: 'Collection carousel', category: 'Collections', description: 'Scrollable collection cards.' }, main_collection_banner: { label: 'Collection banner', category: 'Collections', description: 'Collection title and intro.' }, main_collection_grid: { label: 'Collection products', category: 'Collections', description: 'Products for the current collection.' }, rich_text: { label: 'Rich text', category: 'Content', description: 'Text-led editorial content.' }, multicolumn: { label: 'Multicolumn', category: 'Content', description: 'Feature or benefit cards.' }, testimonials: { label: 'Testimonials', category: 'Content', description: 'Customer quotes and social proof.' }, logo_list: { label: 'Logo list', category: 'Content', description: 'Partner or press logos.' }, faq: { label: 'Collapsible content', category: 'Content', description: 'Expandable questions and answers.' }, newsletter: { label: 'Email signup banner', category: 'Content', description: 'Newsletter signup section.' }, announcement: { label: 'Announcement bar', category: 'Header', description: 'Storewide promotion or notice.' }, header: { label: 'Header', category: 'Header', description: 'Logo, navigation and actions.' }, footer: { label: 'Footer', category: 'Footer', description: 'Footer navigation and policies.' }, main_product: { label: 'Product', category: 'Products', description: 'Main product information and purchase controls.' }
}
const PICKER = Object.keys(META).filter((key) => !['announcement', 'header', 'footer', 'main_product'].includes(key))
const clone = <T,>(value: T): T => structuredClone(value)
const labelFor = (type: string) => META[type]?.label || type.replaceAll('_', ' ')

function fallbackTemplate(key: string, source: Section[]) {
  if (key === 'Home page') return clone(source)
  if (key === 'Product') return [{ id: 'product-ann', type: 'announcement', enabled: true, settings: { text: 'Free shipping on orders over $50' } }, { id: 'product-head', type: 'header', enabled: true, settings: {} }, { id: 'product-main', type: 'main_product', enabled: true, settings: {} }, { id: 'product-recs', type: 'product_recommendations', enabled: true, settings: { heading: 'You may also like', limit: 4, columns: 4 } }, { id: 'product-foot', type: 'footer', enabled: true, settings: {} }] as Section[]
  if (key === 'Collection') return [{ id: 'collection-ann', type: 'announcement', enabled: true, settings: { text: 'Free shipping on orders over $50' } }, { id: 'collection-head', type: 'header', enabled: true, settings: {} }, { id: 'collection-banner', type: 'main_collection_banner', enabled: true, settings: { heading: 'Collection' } }, { id: 'collection-grid', type: 'main_collection_grid', enabled: true, settings: { heading: 'Products', limit: 24, columns: 4 } }, { id: 'collection-foot', type: 'footer', enabled: true, settings: {} }] as Section[]
  return [{ id: `${key}-intro`, type: 'rich_text', enabled: true, settings: { eyebrow: key.toUpperCase(), heading: key, text: 'Build this template from the sections below.' } }, { id: `${key}-products`, type: 'product_grid', enabled: true, settings: { heading: 'Featured products', limit: 8, columns: 4 } }, { id: `${key}-footer`, type: 'footer', enabled: true, settings: {} }] as Section[]
}

function Field({ label, value, onChange }: { label: string; value: any; onChange: (value: string) => void }) { return <label className={styles.field}><span>{label}</span><input value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label> }
function TextArea({ label, value, onChange }: { label: string; value: any; onChange: (value: string) => void }) { return <label className={styles.field}><span>{label}</span><textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label> }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className={styles.field}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> }
function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className={styles.range}><div><span>{label}</span><b>{value}</b></div><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label> }

export default function ShopifyThemeEditorV3({ initial }: { initial: { theme: Theme; sections: Section[]; navigation: any[] } }) {
  const [theme, setTheme] = useState<Theme>(() => clone(initial.theme || {}))
  const [navigation, setNavigation] = useState<any[]>(() => clone(initial.navigation || []))
  const [template, setTemplate] = useState(String(initial.theme?.editorTemplateKey || 'Home page'))
  const [sections, setSections] = useState<Section[]>(() => clone(initial.theme?.editorTemplates?.[initial.theme?.editorTemplateKey] || initial.sections || []))
  const [selectedId, setSelectedId] = useState(sections[0]?.id || '')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])

  const selected = useMemo(() => sections.find((section) => section.id === selectedId) || null, [sections, selectedId])
  const selectedIndex = useMemo(() => sections.findIndex((section) => section.id === selectedId), [sections, selectedId])

  useEffect(() => { let active = true; Promise.all([fetch('/api/products', { cache: 'no-store' }).then((r) => r.ok ? r.json() : []).catch(() => []), fetch('/api/admin/collections', { cache: 'no-store' }).then((r) => r.ok ? r.json() : []).catch(() => [])]).then(([productData, collectionData]) => { if (!active) return; setProducts(Array.isArray(productData) ? productData : []); setCollections(Array.isArray(collectionData) ? collectionData : []) }); return () => { active = false } }, [])
  useEffect(() => { let active = true; const loadNavigation = async () => { try { const response = await fetch('/api/navigation', { cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (active && Array.isArray(data.navigation)) setNavigation(data.navigation) } catch {} }; void loadNavigation(); const timer = window.setInterval(loadNavigation, 3000); window.addEventListener('focus', loadNavigation); return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', loadNavigation) } }, [])

  const snapshot = (): Snapshot => ({ theme: clone(theme), template, sections: clone(sections), navigation: clone(navigation) })
  const apply = (next: Snapshot, record = true) => { if (record) setHistory((items) => [...items, snapshot()].slice(-50)); setFuture([]); setTheme(next.theme); setTemplate(next.template); setSections(next.sections); setNavigation(next.navigation); setDirty(true) }
  const mutate = (fn: (current: Snapshot) => Snapshot) => apply(fn(snapshot()))

  const switchTemplate = (nextTemplate: string) => {
    if (nextTemplate === template) return
    const templates = clone(theme.editorTemplates || {})
    templates[template] = clone(sections)
    const target = clone(templates[nextTemplate] || fallbackTemplate(nextTemplate, initial.sections || []))
    const nextTheme = { ...theme, editorTemplates: templates, editorTemplateKey: nextTemplate }
    setTheme(nextTheme)
    setTemplate(nextTemplate)
    setSections(target)
    setSelectedId(target[0]?.id || '')
    setDrawerOpen(false)
    setSettingsOpen(false)
    setPickerOpen(false)
    setQuery('')
    setHistory([])
    setFuture([])
    setDirty(true)
    setNotice(`Editing ${nextTemplate}`)
  }

  const updateSelected = (patch: Record<string, any>) => { if (!selected) return; mutate((current) => ({ ...current, sections: current.sections.map((section) => section.id === selected.id ? { ...section, settings: { ...(section.settings || {}), ...patch } } : section) })) }
  const addSection = (type: string) => { const settings = type === 'hero' ? { eyebrow: 'NEW COLLECTION', heading: 'Make your store impossible to ignore.', text: 'A premium storefront built for conversion.', buttonLabel: 'Shop now', buttonUrl: '/shop', imageUrl: '', minHeight: 560, spacing: 0 } : { heading: labelFor(type), subheading: '', limit: type.includes('product') ? 8 : 4, columns: 4, spacing: 72 }; const next: Section = { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, enabled: true, settings, blocks: [] }; mutate((current) => { const list = [...current.sections]; list.splice(selectedIndex >= 0 ? selectedIndex + 1 : list.length, 0, next); return { ...current, sections: list } }); setSelectedId(next.id); setDrawerOpen(true); setPickerOpen(false); setQuery('') }
  const removeSection = () => { if (!selected) return; const remaining = sections.filter((section) => section.id !== selected.id); mutate((current) => ({ ...current, sections: remaining })); setSelectedId(remaining[Math.max(0, selectedIndex - 1)]?.id || remaining[0]?.id || ''); setDrawerOpen(false) }
  const duplicateSection = () => { if (!selected) return; const copy = clone(selected); copy.id = `${selected.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; mutate((current) => { const list = [...current.sections]; list.splice(selectedIndex + 1, 0, copy); return { ...current, sections: list } }); setSelectedId(copy.id) }
  const moveSelected = (delta: number) => { if (selectedIndex < 0) return; mutate((current) => { const list = [...current.sections]; const nextIndex = selectedIndex + delta; if (nextIndex < 0 || nextIndex >= list.length) return current; [list[selectedIndex], list[nextIndex]] = [list[nextIndex], list[selectedIndex]]; return { ...current, sections: list } }) }
  const toggleSection = (id: string) => mutate((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? { ...section, enabled: section.enabled === false } : section) }))
  const dropSection = (targetId: string) => { if (!dragId || dragId === targetId) return; const from = sections.findIndex((section) => section.id === dragId); const to = sections.findIndex((section) => section.id === targetId); if (from < 0 || to < 0) return; mutate((current) => { const list = [...current.sections]; const [item] = list.splice(from, 1); list.splice(to, 0, item); return { ...current, sections: list } }); setDragId(null) }
  const updateTheme = (patch: Record<string, any>) => mutate((current) => ({ ...current, theme: { ...current.theme, ...patch } }))

  const save = async () => {
    setSaving(true); setNotice(''); setError('')
    const editorTemplates = { ...(theme.editorTemplates || {}), [template]: clone(sections) }
    const nextTheme = { ...theme, editorTemplates, editorTemplateKey: template }
    const homeSections = clone(editorTemplates['Home page'] || initial.sections || [])
    try {
      const response = await fetch('/api/admin/theme', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: nextTheme, sections: homeSections, editorTemplates, templateKey: template }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save theme')
      setTheme(data.theme || nextTheme)
      setDirty(false)
      setNotice(`${template} saved · draft synced`)
      try { const channel = new BroadcastChannel('store-theme'); channel.postMessage({ theme: data.theme || nextTheme, sections: data.sections || homeSections }); channel.close() } catch {}
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save theme') } finally { setSaving(false) }
  }

  const undo = () => { if (!history.length) return; const previous = history[history.length - 1]; setFuture((items) => [...items, snapshot()]); setHistory((items) => items.slice(0, -1)); apply(previous, false) }
  const redo = () => { if (!future.length) return; const next = future[future.length - 1]; setHistory((items) => [...items, snapshot()]); setFuture((items) => items.slice(0, -1)); apply(next, false) }

  const visibleSections = sections.filter((section) => section.enabled !== false && !['announcement', 'header', 'footer'].includes(section.type))
  const pickerGroups = useMemo(() => { const q = query.trim().toLowerCase(); return ['Hero & media', 'Products', 'Collections', 'Content'].map((category) => ({ category, items: PICKER.filter((key) => META[key].category === category && (!q || META[key].label.toLowerCase().includes(q))) })).filter((group) => group.items.length) }, [query])
  const announcement = sections.find((section) => section.type === 'announcement')?.settings?.text || theme.announcement?.text || 'Free shipping on orders over $50'
  const brand = theme.brandName || 'YALLA HAUL'

  return <div className={styles.editor}>
    <header className={styles.topbar}>
      <div className={styles.topLeft}><a className={styles.iconButton} href="/admin/online-store"><ArrowLeft size={17}/></a><div><div className={styles.eyebrow}>ONLINE STORE</div><strong>Theme editor</strong></div></div>
      <label className={styles.templatePicker}><span>Template</span><select value={template} onChange={(event) => switchTemplate(event.target.value)}>{TEMPLATES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className={styles.topActions}>{dirty && <span className={styles.unsaved}><i/>Unsaved changes</span>}<button className={styles.iconButton} disabled={!history.length} onClick={undo}><Undo2 size={16}/></button><button className={styles.iconButton} disabled={!future.length} onClick={redo}><Redo2 size={16}/></button><div className={styles.deviceSwitch}>{(['desktop','tablet','mobile'] as const).map((item) => <button key={item} className={device === item ? styles.active : ''} onClick={() => setDevice(item)}>{item === 'desktop' ? <Monitor size={15}/> : item === 'tablet' ? <Tablet size={15}/> : <Smartphone size={15}/>}</button>)}</div><button className={styles.secondaryButton} onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}><Eye size={15}/>View live</button><button className={styles.primaryButton} disabled={saving} onClick={save}><Save size={15}/>{saving ? 'Saving…' : 'Save'}</button></div>
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}><div><div className={styles.eyebrow}>{template}</div><h2>Sections</h2><p>{sections.filter((section) => section.enabled !== false).length} visible · {sections.length} total</p></div><button className={styles.iconButton} onClick={() => setPickerOpen(true)}><Plus size={17}/></button></div>
        <div className={styles.sectionList}>{sections.map((section, index) => <div key={section.id} draggable onDragStart={() => setDragId(section.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropSection(section.id)} className={`${styles.sectionRow} ${selectedId === section.id ? styles.selected : ''} ${section.enabled === false ? styles.disabled : ''}`}><button className={styles.dragHandle} title="Drag to reorder"><GripVertical size={15}/></button><button className={styles.sectionMain} onClick={() => { setSelectedId(section.id); setDrawerOpen(true) }}><span>{labelFor(section.type)}</span>{index === 0 && <em>MAIN</em>}</button><button className={styles.visibilityButton} onClick={() => toggleSection(section.id)}>{section.enabled === false ? '○' : '●'}</button></div>)}</div>
        <button className={styles.addSection} onClick={() => setPickerOpen(true)}><Plus size={15}/>Add section</button>
        <div className={styles.sidebarLinks}><a href="/admin/online-store/navigation"><Settings2 size={14}/>Navigation</a><a href="/admin/media"><ImageIcon size={14}/>Media library</a></div>
      </aside>
      <main className={`${styles.preview} ${styles[device]}`}><div className={styles.previewBar}><div><span>LIVE PREVIEW</span><strong>{template}</strong></div><span className={styles.live}><i/>Saved storefront</span></div><div className={styles.canvas}><div className={styles.store}><div className={styles.announcement}>{announcement}</div><StorefrontSections sections={visibleSections} theme={theme} products={products} collections={collections}/></div></div></main>
      {drawerOpen && selected && <aside className={styles.drawer}><div className={styles.drawerHead}><div><span>SECTION</span><h2>{labelFor(selected.type)}</h2></div><div className={styles.drawerActions}><button onClick={() => moveSelected(-1)} disabled={selectedIndex <= 0}><ArrowLeft size={14}/></button><button onClick={() => moveSelected(1)} disabled={selectedIndex >= sections.length - 1}><ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }}/></button><button onClick={duplicateSection}><Copy size={14}/></button><button onClick={removeSection} className={styles.danger}><Trash2 size={14}/></button><button onClick={() => setDrawerOpen(false)}><X size={15}/></button></div></div><div className={styles.drawerBody}><Field label="Heading" value={selected.settings?.heading || ''} onChange={(value) => updateSelected({ heading: value })}/><TextArea label="Text" value={selected.settings?.text || ''} onChange={(value) => updateSelected({ text: value })}/><Field label="Button label" value={selected.settings?.buttonLabel || ''} onChange={(value) => updateSelected({ buttonLabel: value })}/><Field label="Button URL" value={selected.settings?.buttonUrl || ''} onChange={(value) => updateSelected({ buttonUrl: value })}/><Select label="Columns" value={String(selected.settings?.columns || 4)} options={['2','3','4','5','6']} onChange={(value) => updateSelected({ columns: Number(value) })}/><Range label="Spacing" value={Number(selected.settings?.spacing || 72)} min={0} max={160} onChange={(value) => updateSelected({ spacing: value })}/></div></aside>}
    </div>
    {pickerOpen && <div className={styles.modalBackdrop} onMouseDown={() => setPickerOpen(false)}><div className={styles.picker} onMouseDown={(event) => event.stopPropagation()}><div className={styles.pickerHead}><div><span>ADD SECTION</span><h2>Build {template}</h2></div><button className={styles.iconButton} onClick={() => setPickerOpen(false)}><X size={16}/></button></div><div className={styles.search}><Search size={15}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sections"/></div>{pickerGroups.map((group) => <div className={styles.pickerGroup} key={group.category}><span>{group.category}</span>{group.items.map((key) => <button key={key} onClick={() => addSection(key)}><div><strong>{META[key].label}</strong><small>{META[key].description}</small></div><Plus size={15}/></button>)}</div>)}</div></div>}
    {notice && <div className={styles.toast}>{notice}</div>}
    {error && <div className={`${styles.toast} ${styles.error}`}>{error}</div>}
  </div>
}
