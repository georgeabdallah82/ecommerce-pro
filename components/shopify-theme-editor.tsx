'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Copy, Eye, GripVertical, Image as ImageIcon, LayoutTemplate, Monitor, Palette, Plus, Redo2, Save, Search, Settings2, Smartphone, Tablet, Trash2, Undo2, X } from 'lucide-react'

type Block = { id: string; type: string; settings: Record<string, any> }
type Section = { id: string; type: string; enabled: boolean; settings: Record<string, any>; blocks?: Block[] }
type Theme = Record<string, any>
type Snapshot = { theme: Theme; sections: Section[]; navigation: any[] }
type CatalogProduct = { id: string; name: string; slug?: string; basePrice: number; compareAtPrice?: number | null; images?: { url: string }[]; category?: { name: string } | null }
type CatalogCollection = { id: string; name: string; slug: string; description?: string | null; imageUrl?: string | null }

const META: Record<string, { label: string; category: string; description: string; storeType: string }> = {
  announcement: { label: 'Announcement bar', category: 'Header', description: 'Promotions, shipping notices and store announcements.', storeType: 'announcement' },
  header: { label: 'Header', category: 'Header', description: 'Logo, navigation, search and customer actions.', storeType: 'header' },
  hero: { label: 'Image banner', category: 'Hero & media', description: 'Large image-led hero with text and calls to action.', storeType: 'hero' },
  slideshow: { label: 'Slideshow', category: 'Hero & media', description: 'Rotating slides with images, copy and buttons.', storeType: 'slideshow' },
  video: { label: 'Video', category: 'Hero & media', description: 'Featured video or poster image with play button.', storeType: 'video' },
  image_with_text: { label: 'Image with text', category: 'Hero & media', description: 'Editorial image and copy split layout.', storeType: 'image_with_text' },
  product_grid: { label: 'Featured collection', category: 'Products', description: 'Show a curated collection of products.', storeType: 'product_grid' },
  product_carousel: { label: 'Featured collection carousel', category: 'Products', description: 'Scrollable product collection.', storeType: 'product_carousel' },
  collection_grid: { label: 'Collection list', category: 'Collections', description: 'Display collections as visual cards.', storeType: 'collection_grid' },
  collection_carousel: { label: 'Collection carousel', category: 'Collections', description: 'Scrollable collection cards.', storeType: 'collection_carousel' },
  featured_product: { label: 'Featured product', category: 'Products', description: 'Highlight one product with purchase-focused content.', storeType: 'product_grid' },
  product_recommendations: { label: 'Product recommendations', category: 'Products', description: 'Show products related to the current catalog.', storeType: 'product_grid' },
  main_collection_banner: { label: 'Collection banner', category: 'Collections', description: 'Collection title, image and introductory content.', storeType: 'collection_grid' },
  main_collection_grid: { label: 'Collection products', category: 'Collections', description: 'Main product grid for a collection template.', storeType: 'product_grid' },
  multicolumn: { label: 'Multicolumn', category: 'Content', description: 'Flexible cards for features, benefits or editorial content.', storeType: 'promo_grid' },
  rich_text: { label: 'Rich text', category: 'Content', description: 'Text-focused editorial section.', storeType: 'rich_text' },
  testimonials: { label: 'Testimonials', category: 'Content', description: 'Customer quotes and social proof.', storeType: 'testimonials' },
  logo_list: { label: 'Logo list', category: 'Content', description: 'Brands, partners or press logos.', storeType: 'logo_list' },
  faq: { label: 'Collapsible content', category: 'Content', description: 'Expandable questions and answers.', storeType: 'faq' },
  newsletter: { label: 'Email signup banner', category: 'Content', description: 'Newsletter signup with a promotional message.', storeType: 'newsletter' },
  footer: { label: 'Footer', category: 'Footer', description: 'Footer navigation, newsletter and policies.', storeType: 'footer' },
}

const PICKER = ['hero','slideshow','video','image_with_text','product_grid','product_carousel','featured_product','product_recommendations','collection_grid','collection_carousel','main_collection_banner','multicolumn','rich_text','testimonials','logo_list','faq','newsletter','footer']
const CATEGORY_ORDER = ['Hero & media','Products','Collections','Content','Footer']
const TEMPLATES = ['Home page','Products','Product','Collections','Collection','Cart','Pages','Blog']

function clone<T>(value: T): T { return structuredClone(value) }

function defaults(type: string): Record<string, any> {
  if (type === 'hero') return { eyebrow: 'NEW COLLECTION', heading: 'Make your store impossible to ignore.', text: 'A premium storefront built for conversion.', buttonLabel: 'Shop now', buttonUrl: '/shop', secondaryLabel: 'Explore collections', secondaryUrl: '/collections', imageUrl: '', desktopImageUrl: '', mobileImageUrl: '', imageAlt: '', focalX: 50, focalY: 50, mobileFocalX: 50, mobileFocalY: 50, imageFit: 'cover', overlay: .25, overlayColor: '#000000', overlayStyle: 'bottom-gradient', contentPosition: 'center-left', contentWidth: 620, contentBox: false, minHeight: 620 }
  if (type === 'slideshow') return { heading: 'Featured', subheading: '', autoplay: true, speed: 5, minHeight: 540 }
  if (type === 'video') return { heading: 'Watch the story', text: '', imageUrl: '', url: '', minHeight: 460 }
  if (type === 'image_with_text') return { eyebrow: 'THE BRAND', heading: 'Tell your story.', text: 'Combine imagery, copy and a strong call to action.', buttonLabel: 'Learn more', buttonUrl: '#', imageUrl: '', layout: 'image-right' }
  if (type.includes('product') || type === 'featured_product') return { heading: META[type]?.label || 'Featured products', subheading: 'Best sellers, new arrivals or a hand-picked edit.', limit: type === 'featured_product' ? 1 : 8, columns: type === 'featured_product' ? 1 : 4, showViewAll: true, collection: '' }
  if (type.includes('collection')) return { heading: 'Shop by collection', subheading: 'Build a visual path through your catalog.', limit: 4, columns: 4 }
  if (type === 'multicolumn') return { heading: 'Why shop with us?', subheading: '', columns: 3 }
  if (type === 'testimonials') return { heading: 'Loved by customers', subheading: 'Real feedback makes the store feel real.', columns: 3 }
  if (type === 'logo_list') return { heading: 'Featured in', columns: 5 }
  if (type === 'faq') return { heading: 'Frequently asked questions' }
  if (type === 'newsletter') return { heading: 'Stay in the loop', text: 'Get launches, drops and offers in your inbox.', buttonLabel: 'Subscribe', background: 'primary' }
  if (type === 'announcement') return { enabled: true, text: 'Free shipping on orders over $50', link: '', position: 'above', autoplay: false }
  return { heading: META[type]?.label || type }
}

function blocksFor(type: string): Block[] {
  const stamp = Date.now()
  if (type === 'slideshow') return [1,2].map((n) => ({ id: `slide-${stamp}-${n}`, type: 'slide', settings: { heading: `Slide ${n}`, text: 'Add a campaign message and call to action.', buttonLabel: 'Shop now', buttonUrl: '/shop', imageUrl: '' } }))
  if (type === 'multicolumn') return ['Fast delivery','Secure checkout','Helpful support'].map((title, i) => ({ id: `column-${stamp}-${i}`, type: 'column', settings: { heading: title, text: 'Add a benefit or feature description.', imageUrl: '' } }))
  if (type === 'testimonials') return ['Happy customer','Returning customer','Verified buyer'].map((author, i) => ({ id: `quote-${stamp}-${i}`, type: 'quote', settings: { quote: ['Beautiful products and a premium experience.','Everything was easy from checkout to delivery.','Exactly what I expected, delivered quickly.'][i], author, role: 'Verified buyer', rating: 5 } }))
  if (type === 'logo_list') return ['Partner 1','Partner 2','Partner 3','Partner 4','Partner 5'].map((text, i) => ({ id: `logo-${stamp}-${i}`, type: 'logo', settings: { text, imageUrl: '', alt: text } }))
  if (type === 'faq') return ['What is your return policy?','How fast do you ship?','How can I contact support?'].map((question, i) => ({ id: `faq-${stamp}-${i}`, type: 'faq', settings: { question, answer: 'Add your answer here.' } }))
  return []
}

function newSection(type: string): Section {
  const s: Section = { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type, enabled: true, settings: defaults(type), blocks: blocksFor(type) }
  if (type === 'featured_product') s.settings.heading = 'Featured product'
  if (type === 'product_recommendations') s.settings.heading = 'You may also like'
  if (type === 'main_collection_banner') s.settings.heading = 'Collection'
  return s
}

export default function ShopifyThemeEditor({ initial }: { initial: { theme: Theme; sections: Section[]; navigation: any[] } }) {
  const [theme, setTheme] = useState<Theme>(() => clone(initial.theme || {}))
  const [sections, setSections] = useState<Section[]>(() => clone(initial.sections || []))
  const [navigation, setNavigation] = useState<any[]>(() => clone(initial.navigation || []))
  const [selectedId, setSelectedId] = useState(sections[0]?.id || '')
  const [device, setDevice] = useState<'desktop'|'tablet'|'mobile'>('desktop')
  const [template, setTemplate] = useState('Home page')
  const [sidebarTab, setSidebarTab] = useState<'sections'|'settings'>('sections')
  const [drawer, setDrawer] = useState(false)
  const [picker, setPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [productData, setProductData] = useState<CatalogProduct[]>([])
  const [collectionData, setCollectionData] = useState<CatalogCollection[]>([])
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const selected = useMemo(() => sections.find(s => s.id === selectedId) || null, [sections, selectedId])
  const selectedIndex = useMemo(() => sections.findIndex(s => s.id === selectedId), [sections, selectedId])
  const groups = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    return CATEGORY_ORDER.map(category => ({ category, items: PICKER.filter(k => META[k].category === category && (!q || META[k].label.toLowerCase().includes(q))) })).filter(g => g.items.length)
  }, [pickerQuery])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/products').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/collections').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([products, collections]) => {
      if (!alive) return
      setProductData(Array.isArray(products) ? products : [])
      setCollectionData(Array.isArray(collections) ? collections.map((c:any) => ({ id:c.id, name:c.name, slug:c.slug, description:c.description, imageUrl:c.imageUrl })) : [])
    })
    return () => { alive = false }
  }, [])

  const snapshot = (): Snapshot => ({ theme: clone(theme), sections: clone(sections), navigation: clone(navigation) })
  const commit = (mutate: (s: Snapshot) => Snapshot) => {
    const before = snapshot()
    const after = mutate(snapshot())
    setHistory(h => [...h, before].slice(-50)); setFuture([])
    setTheme(after.theme); setSections(after.sections); setNavigation(after.navigation); setDirty(true)
  }
  const updateSection = (patch: Record<string, any>) => {
    if (!selected) return
    commit(s => ({ ...s, sections: s.sections.map(x => x.id === selected.id ? { ...x, settings: { ...x.settings, ...patch } } : x) }))
  }
  const addSection = (type: string) => {
    const next = newSection(type)
    commit(s => { const arr = [...s.sections]; const at = selectedIndex >= 0 ? selectedIndex + 1 : arr.length; arr.splice(at, 0, next); return { ...s, sections: arr } })
    setSelectedId(next.id); setPicker(false); setPickerQuery(''); setDrawer(true)
  }
  const removeSection = () => {
    if (!selected) return
    commit(s => ({ ...s, sections: s.sections.filter(x => x.id !== selected.id) }))
    setSelectedId(sections[Math.max(0, selectedIndex - 1)]?.id || sections.find(x => x.id !== selected.id)?.id || '')
    setDrawer(false)
  }
  const duplicateSection = () => {
    if (!selected) return
    const copy = clone(selected); copy.id = `${selected.type}-${Date.now()}-${Math.random().toString(36).slice(2,5)}`; copy.blocks = (copy.blocks || []).map(b => ({ ...b, id: `${b.id}-${Math.random().toString(36).slice(2,6)}` }))
    commit(s => { const arr = [...s.sections]; arr.splice(selectedIndex + 1, 0, copy); return { ...s, sections: arr } })
    setSelectedId(copy.id)
  }
  const move = (delta: number) => {
    if (selectedIndex < 0) return
    commit(s => { const arr = [...s.sections]; const ni = selectedIndex + delta; if (ni < 0 || ni >= arr.length) return s; [arr[selectedIndex], arr[ni]] = [arr[ni], arr[selectedIndex]]; return { ...s, sections: arr } })
  }
  const toggle = (id: string) => commit(s => ({ ...s, sections: s.sections.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x) }))
  const addBlock = (type: string) => {
    if (!selected) return
    const b = { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type, settings: type === 'quote' ? { quote: 'New customer quote', author: 'Customer', role: 'Verified buyer', rating: 5 } : type === 'faq' ? { question: 'New question', answer: 'Add an answer.' } : { heading: 'New item', text: 'Add content here.', imageUrl: '' } }
    commit(s => ({ ...s, sections: s.sections.map(x => x.id === selected.id ? { ...x, blocks: [...(x.blocks || []), b] } : x) }))
  }
  const patchBlock = (blockId: string, patch: Record<string, any>) => {
    if (!selected) return
    commit(s => ({ ...s, sections: s.sections.map(x => x.id === selected.id ? { ...x, blocks: (x.blocks || []).map(b => b.id === blockId ? { ...b, settings: { ...b.settings, ...patch } } : b) } : x) }))
  }
  const deleteBlock = (blockId: string) => {
    if (!selected) return
    commit(s => ({ ...s, sections: s.sections.map(x => x.id === selected.id ? { ...x, blocks: (x.blocks || []).filter(b => b.id !== blockId) } : x) }))
  }
  const updateTheme = (key: string, value: any) => commit(s => ({ ...s, theme: { ...s.theme, [key]: value } }))
  const undo = () => { if (!history.length) return; const prev = history[history.length-1]; setFuture(f => [...f, snapshot()]); setHistory(h => h.slice(0,-1)); setTheme(prev.theme); setSections(prev.sections); setNavigation(prev.navigation); setDirty(true) }
  const redo = () => { if (!future.length) return; const next = future[future.length-1]; setHistory(h => [...h, snapshot()]); setFuture(f => f.slice(0,-1)); setTheme(next.theme); setSections(next.sections); setNavigation(next.navigation); setDirty(true) }
  const save = async (silent = false) => {
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/admin/theme', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme, sections, navigation }) })
      const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Could not save theme')
      setDirty(false); if (!silent) setNotice('Theme saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save theme') } finally { setSaving(false) }
  }

  const editorStyles = `
    .stxEditor{--stx-accent:${theme.colors?.primary || '#ff5a1f'};--stx-accent-text:${theme.colors?.buttonText || '#ffffff'};--stx-bg:${theme.colors?.background || '#fffaf6'};--stx-surface:${theme.colors?.surface || '#ffffff'};--stx-text:${theme.colors?.text || '#191512'};--stx-muted:${theme.colors?.muted || '#746b64'};--stx-border:${theme.colors?.border || '#eaded4'};--stx-secondary:${theme.colors?.secondary || '#fff0e8'};--stx-announcement:${theme.colors?.announcementBg || '#191512'};--stx-announcement-text:${theme.colors?.announcementText || '#ffffff'};}
    .stxTopbar,.stxSidebar,.stxDrawer,.stxPanel,.stxPreviewBar{background:var(--stx-surface)!important;color:var(--stx-text)}
    .stxEditor{background:var(--stx-bg)!important;color:var(--stx-text)}
    .stxTopbar,.stxSidebar,.stxDrawer,.stxPanel,.stxPreviewBar{border-color:var(--stx-border)!important}
    .stxTitle,.stxSidebarHead strong,.stxRowMain,.stxPanel h3,.stxDrawerHead h2,.stxSectionHead h2,.stxImageText h2,.stxNewsletter h2,.stxRich h2{color:var(--stx-text)!important}
    .stxKicker,.stxTemplate span,.stxSidebarHead span,.stxRowMain em,.stxPreviewBar,.stxField>span,.stxSectionHead p,.stxImageText p,.stxNewsletter p,.stxRich p,.stxProductGrid article>span,.stxQuoteGrid small{color:var(--stx-muted)!important}
    .stxDevices button.active,.stxButton.dark,.stxCta,.stxFakeInput b{background:var(--stx-accent)!important;border-color:var(--stx-accent)!important;color:var(--stx-accent-text)!important}
    .stxRow.selected{box-shadow:inset 3px 0 var(--stx-accent)!important;background:var(--stx-secondary)!important;border-color:var(--stx-border)!important}
    .stxLiveSection.selected{outline-color:var(--stx-accent)!important}
    .stxLiveSection:hover{outline-color:color-mix(in srgb,var(--stx-accent) 35%, transparent)!important}
    .stxHoverLabel{background:var(--stx-accent)!important;color:var(--stx-accent-text)!important}
    .stxAnnouncement{background:var(--stx-announcement)!important;color:var(--stx-announcement-text)!important}
    .stxLiveHeader,.stxSection,.stxImageText>div:last-child,.stxRich,.stxFooter,.stxNewsletter.surface,.stxPanel{background:var(--stx-surface)!important;color:var(--stx-text)}
    .stxNewsletter.primary{background:var(--stx-accent)!important;color:var(--stx-accent-text)!important}
    .stxNewsletter.secondary{background:var(--stx-secondary)!important;color:var(--stx-text)!important}
    .stxHero{background-color:var(--stx-secondary)}
    .stxCta{color:var(--stx-accent-text)!important}
    .stxField input,.stxField textarea,.stxField select,.stxAdd,.stxAddSectionWide,.stxPicker,.stxPickerGroup button,.stxButton.ghost,.stxIcon,.stxDrawerActions button,.stxAddBlock button{border-color:var(--stx-border)!important;background:var(--stx-surface)!important;color:var(--stx-text)!important}
    .stxPickerGroup button:hover{border-color:var(--stx-accent)!important}
    .stxBottomLinks a:hover,.stxSidebarTabs button.active{background:var(--stx-secondary)!important;color:var(--stx-text)!important}
    .stxLive{color:var(--stx-accent)!important}
    .stxLive i{background:var(--stx-accent)!important}
    .stxQuoteGrid article{background:var(--stx-surface)!important;border-color:var(--stx-border)!important}
  `

  return <div className="stxEditor">
    <style>{editorStyles}</style>
    <header className="stxTopbar">
      <div className="stxTopLeft"><a className="stxBack" href="/admin/online-store"><ArrowLeft size={17}/></a><div><div className="stxKicker">ONLINE STORE</div><div className="stxTitle">Theme editor</div></div></div>
      <div className="stxTemplate"><select value={template} onChange={e => setTemplate(e.target.value)}>{TEMPLATES.map(t => <option key={t}>{t}</option>)}</select><span>Template</span></div>
      <div className="stxTopRight"><button className="stxIcon" disabled={!history.length} onClick={undo} title="Undo"><Undo2 size={16}/></button><button className="stxIcon" disabled={!future.length} onClick={redo} title="Redo"><Redo2 size={16}/></button><div className="stxDevices"><button className={device==='desktop'?'active':''} onClick={() => setDevice('desktop')}><Monitor size={15}/></button><button className={device==='tablet'?'active':''} onClick={() => setDevice('tablet')}><Tablet size={15}/></button><button className={device==='mobile'?'active':''} onClick={() => setDevice('mobile')}><Smartphone size={15}/></button></div><button className="stxButton ghost" onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}><Eye size={15}/> Preview</button><button className="stxButton dark" onClick={() => save()} disabled={saving}><Save size={15}/> {saving ? 'Saving…' : 'Save'}</button></div>
    </header>
    <div className="stxBody">
      <aside className="stxSidebar">
        <div className="stxSidebarTabs"><button className={sidebarTab==='sections'?'active':''} onClick={() => setSidebarTab('sections')}><LayoutTemplate size={14}/> Sections</button><button className={sidebarTab==='settings'?'active':''} onClick={() => setSidebarTab('settings')}><Palette size={14}/> Theme settings</button></div>
        {sidebarTab==='sections' ? <>
          <div className="stxSidebarHead"><div><strong>{template}</strong><span>{sections.filter(s => s.enabled).length} visible sections</span></div><button className="stxAdd" onClick={() => setPicker(v => !v)}><Plus size={16}/></button></div>
          <div className="stxSectionList">
            {sections.map((s, i) => <div key={s.id} className={`stxRow ${selectedId===s.id?'selected':''} ${!s.enabled?'disabled':''}`}>
              <button className="stxRowMain" onClick={() => { setSelectedId(s.id); setDrawer(true) }}><GripVertical size={14}/><span>{META[s.type]?.label || s.type}</span>{i===0&&<em>MAIN</em>}</button>
              <button className="stxDots" onClick={() => toggle(s.id)} title={s.enabled ? 'Hide' : 'Show'}>{s.enabled ? '•' : '○'}</button>
            </div>)}
          </div>
          <button className="stxAddSectionWide" onClick={() => setPicker(v => !v)}><Plus size={15}/> Add section</button>
          {picker && <div className="stxPicker">
            <div className="stxPickerHead"><strong>Add section</strong><button onClick={() => setPicker(false)}><X size={15}/></button></div>
            <div className="stxSearch"><Search size={14}/><input autoFocus value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} placeholder="Search sections"/></div>
            <div className="stxPickerScroll">{groups.map(g => <div key={g.category} className="stxPickerGroup"><span>{g.category}</span>{g.items.map(type => <button key={type} onClick={() => addSection(type)}><span><strong>{META[type].label}</strong><small>{META[type].description}</small></span><ChevronRight size={15}/></button>)}</div>)}</div>
          </div>}
          <div className="stxBottomLinks"><a href="/admin/online-store/navigation"><Settings2 size={14}/> Navigation</a><a href="/admin/media"><ImageIcon size={14}/> Media library</a></div>
        </> : <ThemeSettings theme={theme} updateTheme={updateTheme}/>} 
      </aside>
      <main className={`stxPreview ${device}`}>
        <div className="stxPreviewBar"><div><span className="stxKicker">LIVE PREVIEW</span><strong>{template}</strong></div><span className="stxLive"><i/> Saved storefront</span></div>
        <div className="stxCanvas">
          <div className="stxStore" style={{maxWidth: device==='mobile'?390:device==='tablet'?820:1360}}>
            <PreviewHeader theme={theme} navigation={navigation}/>
            {sections.filter(s => s.enabled).map(s => <PreviewSection key={s.id} section={s} theme={theme} products={productData} collections={collectionData} selected={s.id===selectedId} onSelect={() => { setSelectedId(s.id); setDrawer(true) }} />)}
            <footer className="stxStoreFooter"><strong>{theme.brandName || 'YOUR BRAND'}</strong><span>Policies · Contact · Newsletter</span></footer>
          </div>
        </div>
      </main>
      {drawer && selected && <aside className="stxDrawer"><div className="stxDrawerHead"><div><span className="stxKicker">SECTION</span><h2>{META[selected.type]?.label || selected.type}</h2></div><div className="stxDrawerActions"><button onClick={() => move(-1)} disabled={selectedIndex<=0}><ArrowUp size={14}/></button><button onClick={() => move(1)} disabled={selectedIndex>=sections.length-1}><ArrowDown size={14}/></button><button onClick={duplicateSection}><Copy size={14}/></button><button onClick={removeSection} className="danger"><Trash2 size={14}/></button><button onClick={() => setDrawer(false)}><X size={15}/></button></div></div><SectionInspector section={selected} update={updateSection} addBlock={addBlock} patchBlock={patchBlock} deleteBlock={deleteBlock}/></aside>}
    </div>
    {notice && <div className="stxToast">{notice}</div>}
    {error && <div className="stxToast error">{error}</div>}
  </div>
}

function ThemeSettings({ theme, updateTheme }: { theme: Theme; updateTheme: (key:string, value:any) => void }) {
  return <div className="stxThemeSettings">
    <div className="stxIntro"><span>THEME SETTINGS</span><strong>Global design</strong><p>Controls shared across your storefront.</p></div>
    <Panel title="Brand"><Field label="Brand name" value={theme.brandName || ''} onChange={v => updateTheme('brandName', v)}/><Field label="Logo URL" value={theme.logoUrl || ''} onChange={v => updateTheme('logoUrl', v)}/></Panel>
    <Panel title="Colors"><div className="stxTwo"><Color label="Background" value={theme.colors?.background || '#ffffff'} onChange={v => updateTheme('colors', { ...theme.colors, background:v })}/><Color label="Primary" value={theme.colors?.primary || '#ff5a1f'} onChange={v => updateTheme('colors', { ...theme.colors, primary:v })}/><Color label="Text" value={theme.colors?.text || '#111827'} onChange={v => updateTheme('colors', { ...theme.colors, text:v })}/><Color label="Accent" value={theme.colors?.accent || '#2a8b63'} onChange={v => updateTheme('colors', { ...theme.colors, accent:v })}/></div></Panel>
    <Panel title="Typography"><Select label="Heading" value={theme.typography?.heading || 'Inter'} options={['Inter','Manrope','DM Sans','Poppins','Georgia','Playfair Display']} onChange={v => updateTheme('typography', { ...theme.typography, heading:v })}/><Select label="Body" value={theme.typography?.body || 'Inter'} options={['Inter','Manrope','DM Sans','Poppins','Arial','Georgia']} onChange={v => updateTheme('typography', { ...theme.typography, body:v })}/><Range label="Scale" value={Number(theme.typography?.scale || 100)} min={90} max={125} step={5} onChange={v => updateTheme('typography', { ...theme.typography, scale:String(v) })}/></Panel>
    <Panel title="Layout"><Range label="Max width" value={Number(theme.layout?.maxWidth || 1360)} min={960} max={1680} step={10} onChange={v => updateTheme('layout', { ...theme.layout, maxWidth:v })}/><Range label="Section spacing" value={Number(theme.layout?.sectionSpacing || 84)} min={24} max={160} step={4} onChange={v => updateTheme('layout', { ...theme.layout, sectionSpacing:v })}/></Panel>
  </div>
}

function SectionInspector({ section, update, addBlock, patchBlock, deleteBlock }: { section: Section; update: (p:Record<string,any>)=>void; addBlock:(t:string)=>void; patchBlock:(id:string,p:Record<string,any>)=>void; deleteBlock:(id:string)=>void }) {
  const s = section.settings || {}
  const blocks = section.blocks || []
  const field = (label:string, key:string, value=s[key] || '') => <Field label={label} value={String(value)} onChange={v => update({ [key]:v })}/>
  return <div className="stxInspector">
    <div className="stxInspectorTabs"><button className="active">Content</button><button onClick={() => document.getElementById('stx-design')?.scrollIntoView({ behavior:'smooth' })}>Design</button></div>
    <div className="stxInspectorBody">
      <Panel title="Content">
        {section.type==='hero' && <>{field('Eyebrow','eyebrow')}<TextArea label="Heading" value={s.heading || ''} onChange={v => update({heading:v})}/><TextArea label="Supporting text" value={s.text || ''} onChange={v => update({text:v})}/><div className="stxTwo">{field('Button','buttonLabel')}{field('Button URL','buttonUrl')}</div>{field('Image URL','imageUrl')}</>}
        {(section.type.includes('product') || section.type==='featured_product') && <>{field('Heading','heading')}<TextArea label="Subheading" value={s.subheading || ''} onChange={v => update({subheading:v})}/><Select label="Collection" value={s.collection || ''} options={['', 'All products']} onChange={v => update({collection:v})}/><div className="stxTwo"><Range label="Products" value={Number(s.limit || 8)} min={1} max={24} step={1} onChange={v => update({limit:v})}/><Range label="Columns" value={Number(s.columns || 4)} min={1} max={6} step={1} onChange={v => update({columns:v})}/></div></>}
        {(section.type.includes('collection')) && <>{field('Heading','heading')}<TextArea label="Subheading" value={s.subheading || ''} onChange={v => update({subheading:v})}/><div className="stxTwo"><Range label="Collections" value={Number(s.limit || 4)} min={1} max={12} step={1} onChange={v => update({limit:v})}/><Range label="Columns" value={Number(s.columns || 4)} min={1} max={6} step={1} onChange={v => update({columns:v})}/></div></>}
        {section.type==='announcement' && <>{field('Message','text')} {field('Link','link')} <Toggle label="Auto rotate" value={Boolean(s.autoplay)} onChange={v => update({autoplay:v})}/></>}
        {section.type==='image_with_text' && <>{field('Eyebrow','eyebrow')}<TextArea label="Heading" value={s.heading || ''} onChange={v => update({heading:v})}/><TextArea label="Text" value={s.text || ''} onChange={v => update({text:v})}/>{field('Button','buttonLabel')}{field('Button URL','buttonUrl')}{field('Image URL','imageUrl')}<Select label="Layout" value={s.layout || 'image-right'} options={['image-left','image-right']} onChange={v => update({layout:v})}/></>}
        {section.type==='newsletter' && <>{field('Heading','heading')}<TextArea label="Text" value={s.text || ''} onChange={v => update({text:v})}/>{field('Button','buttonLabel')}<Select label="Style" value={s.background || 'primary'} options={['primary','secondary','surface','dark']} onChange={v => update({background:v})}/></>}
        {section.type==='video' && <>{field('Heading','heading')}<Field label="Poster image URL" value={s.imageUrl || ''} onChange={v => update({imageUrl:v})}/><Field label="Video URL" value={s.url || ''} onChange={v => update({url:v})}/></>}
        {['rich_text','main_collection_banner'].includes(section.type) && <><TextArea label="Heading" value={s.heading || ''} onChange={v => update({heading:v})}/><TextArea label="Text" value={s.text || ''} onChange={v => update({text:v})}/></>}
        {['slideshow','multicolumn','testimonials','logo_list','faq'].includes(section.type) && <>{field('Heading','heading')}<TextArea label="Subheading" value={s.subheading || ''} onChange={v => update({subheading:v})}/></>}
      </Panel>
      {blocks.length > 0 && <Panel title="Blocks"><div className="stxBlockList">{blocks.map(b => <div className="stxBlock" key={b.id}><div className="stxBlockHead"><span>{b.type}</span><button onClick={() => deleteBlock(b.id)}><Trash2 size={13}/></button></div>{['quote','faq'].includes(b.type) ? <>{fieldForBlock(b,'question','answer',patchBlock)}{b.type==='quote'&&fieldForBlock(b,'quote','author',patchBlock)}{b.type==='quote'&&fieldForBlock(b,'author','role',patchBlock)}</> : <>{fieldForBlock(b,'heading','text',patchBlock)}</>}</div>)}</div><div className="stxAddBlock"><button onClick={() => addBlock(section.type==='testimonials'?'quote':section.type==='faq'?'faq':'column')}><Plus size={13}/> Add block</button></div></Panel>}
      <Panel title="Design"><div id="stx-design"/><div className="stxTwo"><Range label="Top/bottom spacing" value={Number(s.spacing || 84)} min={0} max={160} step={4} onChange={v => update({spacing:v})}/><Range label="Content width" value={Number(s.contentWidth || 1200)} min={640} max={1500} step={20} onChange={v => update({contentWidth:v})}/></div></Panel>
    </div>
  </div>
}

function fieldForBlock(b:Block, a:string, bkey:string, patch:(id:string,p:Record<string,any>)=>void) { return <div className="stxTwo"><Field label={a} value={String(b.settings?.[a] || '')} onChange={v => patch(b.id,{[a]:v})}/><Field label={bkey} value={String(b.settings?.[bkey] || '')} onChange={v => patch(b.id,{[bkey]:v})}/></div> }
function PreviewHeader({ theme, navigation }: { theme:Theme; navigation:any[] }) { return <><div className="stxAnnouncement" style={{background:theme.colors?.announcementBg || theme.colors?.primary, color:theme.colors?.announcementText || '#fff'}}>{theme.announcement?.text || 'Free shipping on orders over $50'}</div><header className="stxLiveHeader"><strong>{theme.logoUrl ? <img src={theme.logoUrl} alt={theme.brandName || ''}/> : (theme.brandName || 'YOUR BRAND')}</strong><nav>{navigation.slice(0,5).map(n => <span key={n.id}>{n.label}</span>)}</nav><div>⌕　♡　🛍</div></header></> }
function PreviewSection({ section, theme, products, collections, selected, onSelect }: { section:Section; theme:Theme; products:CatalogProduct[]; collections:CatalogCollection[]; selected:boolean; onSelect:()=>void }) {
  const s=section.settings || {}
  const wrap = (child:React.ReactNode) => <div className={`stxLiveSection ${selected?'selected':''}`} onClick={onSelect}>{child}<span className="stxHoverLabel">{META[section.type]?.label || section.type}</span></div>
  const cols=Math.min(6,Math.max(1,Number(s.columns||4)))
  if (section.type==='announcement') return selected ? wrap(<div className="stxAnnouncement">{s.text || 'Announcement bar'}</div>) : null
  if (section.type==='hero') return wrap(<section className="stxHero" style={{minHeight:Number(s.minHeight||560),backgroundImage:s.imageUrl?`linear-gradient(rgba(0,0,0,.24),rgba(0,0,0,.24)),url(${s.imageUrl})`:'linear-gradient(135deg,#18181b,#6b4b3b)'}}><div><small>{s.eyebrow}</small><h1>{s.heading}</h1><p>{s.text}</p><span className="stxCta">{s.buttonLabel || 'Shop now'}</span></div></section>)
  if (section.type==='slideshow') { const b=section.blocks?.[0]?.settings || {}; return wrap(<section className="stxHero" style={{backgroundImage:b.imageUrl?`linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)),url(${b.imageUrl})`:'linear-gradient(135deg,#121212,#6d3b25)'}}><div><small>SLIDESHOW</small><h1>{b.heading || s.heading || 'Featured campaign'}</h1><p>{b.text || 'Add slides from the section settings.'}</p><span className="stxCta">{b.buttonLabel || 'Shop now'}</span></div></section>) }
  if (section.type.includes('product')) { const items=products.slice(0,Number(s.limit || 8)); return wrap(<section className="stxSection"><div className="stxSectionHead"><div><small>PRODUCTS</small><h2>{s.heading || 'Featured collection'}</h2><p>{s.subheading}</p></div><span>View all →</span></div><div className="stxProductGrid" style={{gridTemplateColumns:`repeat(${cols},1fr)`}}>{items.length ? items.map(p => <article key={p.id}><div className="stxProductImage">{p.images?.[0]?.url && <img src={p.images[0].url} alt=""/>}</div><strong>{p.name}</strong><span>${(Number(p.basePrice||0)/100).toFixed(2)}</span></article>) : Array.from({length:Math.min(4,Number(s.limit||4))}).map((_,i)=><article key={i}><div className="stxProductImage placeholder"/><strong>Product {i+1}</strong><span>$24.00</span></article>)}</div></section>) }
  if (section.type.includes('collection')) { const items=collections.slice(0,Number(s.limit||4)); return wrap(<section className="stxSection"><div className="stxSectionHead"><div><small>COLLECTIONS</small><h2>{s.heading || 'Collection list'}</h2><p>{s.subheading}</p></div></div><div className="stxCollectionGrid" style={{gridTemplateColumns:`repeat(${Math.min(6,Math.max(1,Number(s.columns||4)))},1fr)`}}>{items.map(c => <article key={c.id}><div className="stxCollectionImage">{c.imageUrl && <img src={c.imageUrl} alt=""/>}</div><strong>{c.name}</strong></article>)}</div></section>) }
  if (section.type==='image_with_text') return wrap(<section className="stxImageText"><div className="stxImage" style={{backgroundImage:s.imageUrl?`url(${s.imageUrl})`:undefined}}/><div><small>{s.eyebrow}</small><h2>{s.heading}</h2><p>{s.text}</p><span>{s.buttonLabel || 'Learn more'} →</span></div></section>)
  if (section.type==='video') return wrap(<section className="stxSection"><div className="stxVideo" style={{backgroundImage:s.imageUrl?`linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)),url(${s.imageUrl})`:undefined}}><span>▶</span></div></section>)
  if (section.type==='newsletter') return wrap(<section className={`stxNewsletter ${s.background || 'primary'}`}><div><small>NEWSLETTER</small><h2>{s.heading}</h2><p>{s.text}</p></div><div className="stxFakeInput">Email address <b>{s.buttonLabel || 'Subscribe'}</b></div></section>)
  if (section.type==='testimonials') return wrap(<section className="stxSection"><div className="stxSectionHead"><div><small>REVIEWS</small><h2>{s.heading}</h2></div></div><div className="stxQuoteGrid">{(section.blocks||[]).slice(0,3).map(b => <article key={b.id}><div>★★★★★</div><p>“{b.settings.quote}”</p><strong>{b.settings.author}</strong><small>{b.settings.role}</small></article>)}</div></section>)
  if (section.type==='faq') return wrap(<section className="stxSection"><div className="stxSectionHead"><div><small>FAQ</small><h2>{s.heading}</h2></div></div><div className="stxFaq">{(section.blocks||[]).map(b => <div key={b.id}><strong>{b.settings.question}</strong><span>＋</span></div>)}</div></section>)
  if (section.type==='logo_list' || section.type==='multicolumn') return wrap(<section className="stxSection"><div className="stxSectionHead"><div><small>CONTENT</small><h2>{s.heading}</h2></div></div><div className="stxCards" style={{gridTemplateColumns:`repeat(${cols},1fr)`}}>{(section.blocks||[]).map(b => <article key={b.id}><div className="stxCardImage"/><strong>{b.settings.heading || b.settings.text || 'Brand'}</strong><p>{b.settings.text}</p></article>)}</div></section>)
  if (section.type==='rich_text' || section.type==='main_collection_banner') return wrap(<section className="stxRich"><small>{section.type==='main_collection_banner'?'COLLECTION':'CONTENT'}</small><h2>{s.heading || 'Tell your story'}</h2><p>{s.text || 'Add rich text content from the editor.'}</p></section>)
  if (section.type==='footer') return wrap(<footer className="stxFooter">{theme.brandName || 'YOUR BRAND'}<span>Policies · Contact · Newsletter</span></footer>)
  return null
}

function Panel({ title, children }: { title:string; children:React.ReactNode }) { return <section className="stxPanel"><h3>{title}</h3><div>{children}</div></section> }
function Field({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) { return <label className="stxField"><span>{label}</span><input value={value || ''} onChange={e => onChange(e.target.value)}/></label> }
function TextArea({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) { return <label className="stxField"><span>{label}</span><textarea value={value || ''} onChange={e => onChange(e.target.value)}/></label> }
function Select({ label, value, options, onChange }: { label:string; value:string; options:string[]; onChange:(v:string)=>void }) { return <label className="stxField"><span>{label}</span><select value={value || ''} onChange={e => onChange(e.target.value)}>{options.map(o => <option value={o} key={o}>{o || 'None'}</option>)}</select></label> }
function Range({ label, value, min, max, step, onChange }: { label:string; value:number; min:number; max:number; step:number; onChange:(v:number)=>void }) { return <label className="stxField"><div className="stxRangeLabel"><span>{label}</span><b>{value}</b></div><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label> }
function Color({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) { return <label className="stxField"><span>{label}</span><div className="stxColor"><input type="color" value={value} onChange={e => onChange(e.target.value)}/><input value={value} onChange={e => onChange(e.target.value)}/></div></label> }
function Toggle({ label, value, onChange }: { label:string; value:boolean; onChange:(v:boolean)=>void }) { return <div className="stxToggle"><span>{label}</span><button className={value?'on':''} onClick={() => onChange(!value)}><i/></button></div> }
