'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  Check,
  Columns3,
  Copy,
  FolderOpen,
  GalleryHorizontal,
  GalleryHorizontalEnd,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Grid3x3,
  Mail,
  MessageSquareQuote,
  Monitor,
  Package,
  PackageCheck,
  Palette,
  PanelBottom,
  PanelTop,
  Plus,
  Redo2,
  Save,
  Smartphone,
  Sparkles,
  SplitSquareHorizontal,
  Tablet,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Video,
  X,
} from 'lucide-react'
import ShopifyThemeInspector from '@/components/shopify-theme-inspector'
import ThemeInspectorStyles from '@/components/theme-inspector-styles'
import styles from './admin-theme-editor.module.css'

const PREVIEW_PATH = '/admin/online-store/theme-editor/preview'

type AnyMap = Record<string, any>
type Section = { id: string; type: string; enabled?: boolean; settings?: AnyMap; blocks?: AnyMap[] }
type Snapshot = { theme: AnyMap; templates: Record<string, Section[]>; page: string; selectedId: string }
type Props = { initial: { theme: AnyMap; sections: Section[]; navigation: any[] } }

const PAGES = ['Home page', 'Products', 'Product', 'Collections', 'Collection', 'Cart', 'Pages', 'Blog']
const META: Record<string, string> = {
  announcement: 'Announcement bar',
  header: 'Header',
  hero: 'Image banner',
  slideshow: 'Slideshow',
  video: 'Video',
  image_with_text: 'Image with text',
  product_grid: 'Featured collection',
  product_carousel: 'Product carousel',
  featured_product: 'Featured product',
  product_recommendations: 'Product recommendations',
  main_product: 'Main product',
  collection_grid: 'Collection list',
  collection_carousel: 'Collection carousel',
  main_collection_banner: 'Collection banner',
  main_collection_grid: 'Collection products',
  multicolumn: 'Multicolumn',
  rich_text: 'Rich text',
  testimonials: 'Testimonials',
  logo_list: 'Logo list',
  faq: 'Collapsible content',
  newsletter: 'Email signup',
  footer: 'Footer',
}
const SECTION_ICONS: Record<string, typeof ImageIcon> = {
  hero: ImageIcon,
  slideshow: Images,
  video: Video,
  image_with_text: SplitSquareHorizontal,
  product_grid: Grid3x3,
  product_carousel: GalleryHorizontalEnd,
  featured_product: Package,
  product_recommendations: Sparkles,
  main_product: PackageCheck,
  collection_grid: FolderOpen,
  collection_carousel: GalleryHorizontal,
  main_collection_banner: PanelTop,
  main_collection_grid: LayoutGrid,
  multicolumn: Columns3,
  rich_text: TypeIcon,
  testimonials: MessageSquareQuote,
  logo_list: BadgeCheck,
  faq: HelpCircle,
  newsletter: Mail,
  footer: PanelBottom,
}
const clone = <T,>(value: T): T => structuredClone(value)
const makeId = (type: string) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const rows = (value: any) => (Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : [])

function sectionDefaults(type: string): Section {
  const base = { spacing: 72, contentWidth: 1180, animation: 'fade-up' }
  if (type === 'announcement') return { id: makeId(type), type, enabled: true, settings: { ...base, text: 'Free shipping on orders over $50', height: 40 } }
  if (type === 'header') return { id: makeId(type), type, enabled: true, settings: { ...base, sticky: true, showSearch: true, showAccount: true, showCart: true, logoWidth: 160 } }
  if (type === 'hero') return { id: makeId(type), type, enabled: true, settings: { ...base, eyebrow: 'NEW COLLECTION', heading: 'Make your store impossible to ignore.', text: 'A premium storefront built for conversion.', buttonLabel: 'Shop now', buttonUrl: '/shop', imageUrl: '', mobileImageUrl: '', minHeight: 640, contentPosition: 'center-left', overlay: 0.2, overlayColor: '#000000', overlayStyle: 'none', imageFit: 'cover', focalX: 50, focalY: 50 } }
  if (type === 'product_grid' || type === 'product_carousel' || type === 'product_recommendations') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: type === 'product_recommendations' ? 'You may also like' : 'Featured products', limit: 8, columns: 4, showViewAll: true } }
  if (type === 'featured_product') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Featured product', limit: 1, columns: 1, productId: '' } }
  if (type === 'collection_grid' || type === 'collection_carousel') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Shop by collection', limit: 4, columns: 4, collectionIds: [] } }
  if (type === 'main_product') return { id: makeId(type), type, enabled: true, settings: { ...base, previewProductId: '', stickyAddToCart: true, showReviews: true, showWishlist: true } }
  if (type === 'main_collection_banner') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Collection' } }
  if (type === 'main_collection_grid') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Products', limit: 24, columns: 4 } }
  if (type === 'image_with_text') return { id: makeId(type), type, enabled: true, settings: { ...base, eyebrow: 'THE BRAND', heading: 'Tell your story.', text: 'Combine imagery, copy and a strong call to action.', buttonLabel: 'Learn more', buttonUrl: '/about', imageUrl: '', layout: 'image-right' } }
  if (type === 'newsletter') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Stay in the loop', text: 'Get launches, drops and offers in your inbox.', buttonLabel: 'Subscribe', background: 'primary' } }
  if (type === 'footer') return { id: makeId(type), type, enabled: true, settings: { ...base, columns: 4 } }
  return { id: makeId(type), type, enabled: true, settings: { ...base, heading: META[type] || 'Section' } }
}

function defaultTemplates(source: Section[]) {
  const home = source?.length
    ? clone(source)
    : [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('hero'), sectionDefaults('product_grid'), sectionDefaults('collection_grid'), sectionDefaults('newsletter'), sectionDefaults('footer')]
  return {
    'Home page': home,
    Products: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('product_grid'), sectionDefaults('newsletter'), sectionDefaults('footer')],
    Product: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('main_product'), sectionDefaults('product_recommendations'), sectionDefaults('newsletter'), sectionDefaults('footer')],
    Collections: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('collection_grid'), sectionDefaults('newsletter'), sectionDefaults('footer')],
    Collection: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('main_collection_banner'), sectionDefaults('main_collection_grid'), sectionDefaults('newsletter'), sectionDefaults('footer')],
    Cart: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('newsletter'), sectionDefaults('footer')],
    Pages: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('hero'), sectionDefaults('rich_text'), sectionDefaults('newsletter'), sectionDefaults('footer')],
    Blog: [sectionDefaults('announcement'), sectionDefaults('header'), sectionDefaults('hero'), sectionDefaults('collection_grid'), sectionDefaults('newsletter'), sectionDefaults('footer')],
  } as Record<string, Section[]>
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: any; onChange: (value: any) => void; type?: string }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input className={styles.input} type={type} value={value ?? ''} onChange={event => onChange(type === 'number' ? Number(event.target.value) : event.target.value)} />
    </label>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>{title}</div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

export default function FocalThemeEditor({ initial }: Props) {
  const fallback = useMemo(() => defaultTemplates(initial.sections), [initial.sections])
  const [theme, setTheme] = useState<AnyMap>(() => clone(initial.theme || {}))
  const [templates, setTemplates] = useState<Record<string, Section[]>>(() => {
    const stored = initial.theme?.editorTemplates || {}
    const base = clone(fallback)
    for (const key of PAGES) if (Array.isArray(stored[key]) && stored[key].length) base[key] = clone(stored[key])
    return base
  })
  const [page, setPage] = useState('Home page')
  const [selectedId, setSelectedId] = useState('')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [sideTab, setSideTab] = useState<'sections' | 'theme'>('sections')
  const [drawerTab, setDrawerTab] = useState<'content' | 'design' | 'advanced'>('content')
  const [drawer, setDrawer] = useState(false)
  const [picker, setPicker] = useState(false)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewHeight, setPreviewHeight] = useState(0)

  const current = templates[page] || []
  const selectedIndex = current.findIndex(section => section.id === selectedId)
  const selected = current[selectedIndex] || null

  useEffect(() => {
    if (!current.some(section => section.id === selectedId)) {
      setSelectedId(current[0]?.id || '')
      setDrawer(false)
    }
  }, [current, selectedId])

  useEffect(() => {
    Promise.all([
      fetch('/api/products', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/admin/collections', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([productData, collectionData]) => {
      setProducts(rows(productData))
      setCollections(rows(collectionData))
    })
  }, [])

  // The preview lives in a same-origin iframe (components/theme-preview-frame.tsx),
  // driven entirely by postMessage instead of shared props/DOM, so the editor
  // chrome's CSS can never bleed into (or be bled into by) the real storefront
  // CSS it's previewing, and device-width preview reflects a real iframe
  // viewport instead of a max-width wrapper div.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (!data || data.source !== 'theme-preview') return
      if (data.type === 'ready') setPreviewReady(true)
      else if (data.type === 'select') { setSelectedId(data.sectionId); setDrawer(true) }
      else if (data.type === 'height') setPreviewHeight(Number(data.height) || 0)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!previewReady) return
    iframeRef.current?.contentWindow?.postMessage({
      source: 'theme-editor',
      type: 'state',
      theme,
      sections: current,
      navigation: initial.navigation,
      products,
      collections,
      selectedId,
    }, window.location.origin)
  }, [previewReady, theme, current, initial.navigation, products, collections, selectedId])

  const commit = (nextTemplates: Record<string, Section[]>, nextTheme = theme) => {
    setHistory(history => [...history, { theme: clone(theme), templates: clone(templates), page, selectedId }].slice(-50))
    setFuture([])
    setTemplates(nextTemplates)
    setTheme(nextTheme)
    setDirty(true)
  }
  const patch = (patches: AnyMap) => {
    if (!selected) return
    commit({ ...templates, [page]: current.map(section => (section.id === selected.id ? { ...section, settings: { ...(section.settings || {}), ...patches } } : section)) })
  }
  const patchBlocks = (blocks: any[]) => {
    if (!selected) return
    commit({ ...templates, [page]: current.map(section => (section.id === selected.id ? { ...section, blocks: clone(blocks) } : section)) })
  }
  const toggle = (value: boolean) => {
    if (!selected) return
    commit({ ...templates, [page]: current.map(section => (section.id === selected.id ? { ...section, enabled: value } : section)) })
  }
  const addSection = (type: string) => {
    const next = sectionDefaults(type)
    const list = [...current]
    list.splice(selectedIndex < 0 ? list.length : selectedIndex + 1, 0, next)
    commit({ ...templates, [page]: list })
    setSelectedId(next.id)
    setDrawer(true)
    setPicker(false)
  }
  const removeSection = () => {
    if (!selected) return
    const list = current.filter(section => section.id !== selected.id)
    const nextId = list[Math.max(0, selectedIndex - 1)]?.id || list[0]?.id || ''
    commit({ ...templates, [page]: list })
    setSelectedId(nextId)
    setDrawer(false)
  }
  const duplicateSection = () => {
    if (!selected) return
    const copy = clone(selected)
    copy.id = makeId(selected.type)
    const list = [...current]
    list.splice(selectedIndex + 1, 0, copy)
    commit({ ...templates, [page]: list })
    setSelectedId(copy.id)
  }
  const moveSection = (delta: number) => {
    if (selectedIndex < 0) return
    const nextIndex = selectedIndex + delta
    if (nextIndex < 0 || nextIndex >= current.length) return
    const list = [...current]
    ;[list[selectedIndex], list[nextIndex]] = [list[nextIndex], list[selectedIndex]]
    commit({ ...templates, [page]: list })
  }
  const dropSection = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const from = current.findIndex(section => section.id === dragId)
    const to = current.findIndex(section => section.id === targetId)
    if (from < 0 || to < 0) return
    const list = [...current]
    const item = list.splice(from, 1)[0]
    list.splice(to, 0, item)
    commit({ ...templates, [page]: list })
    setDragId(null)
  }
  const undo = () => {
    const snapshot = history.at(-1)
    if (!snapshot) return
    setFuture(f => [...f, { theme: clone(theme), templates: clone(templates), page, selectedId }])
    setHistory(h => h.slice(0, -1))
    setTheme(snapshot.theme)
    setTemplates(snapshot.templates)
    setPage(snapshot.page)
    setSelectedId(snapshot.selectedId)
    setDirty(true)
  }
  const redo = () => {
    const snapshot = future.at(-1)
    if (!snapshot) return
    setHistory(h => [...h, { theme: clone(theme), templates: clone(templates), page, selectedId }])
    setFuture(f => f.slice(0, -1))
    setTheme(snapshot.theme)
    setTemplates(snapshot.templates)
    setPage(snapshot.page)
    setSelectedId(snapshot.selectedId)
    setDirty(true)
  }
  const changePage = (nextPage: string) => {
    if (nextPage === page) return
    if (dirty && typeof window !== 'undefined' && !window.confirm('You have unsaved changes. Switch templates anyway?')) return
    setPage(nextPage)
    setSelectedId('')
    setDrawer(false)
  }
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const editorTemplates = { ...(theme.editorTemplates || {}), ...clone(templates) }
      const nextTheme = { ...theme, editorTemplates, editorTemplateKey: page }
      const response = await fetch('/api/admin/theme', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: nextTheme, sections: templates['Home page'] || [], editorTemplates, templateKey: page, navigation: initial.navigation }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save theme')
      setTheme(data.theme || nextTheme)
      setDirty(false)
      setMessage('Theme saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save theme')
    } finally {
      setSaving(false)
    }
  }

  const maxWidth = device === 'mobile' ? 390 : device === 'tablet' ? 820 : 1320
  const frameClass = device === 'mobile' ? styles.frameMobile : device === 'tablet' ? styles.frameTablet : styles.frameDesktop

  return (
    <div className={styles.editor}>
      <ThemeInspectorStyles />

      <header className={styles.top}>
        <div className={styles.topLeft}>
          <a className={styles.iconBtn} href="/admin/online-store">
            <ArrowLeft size={16} />
          </a>
          <div>
            <div className={styles.title}>Theme editor</div>
            <div className={styles.sub}>FOCAL</div>
          </div>
          <select className={styles.select} value={page} onChange={event => changePage(event.target.value)}>
            {PAGES.map(item => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className={styles.topRight}>
          <button className={styles.iconBtn} onClick={undo} disabled={!history.length}><Undo2 size={15} /></button>
          <button className={styles.iconBtn} onClick={redo} disabled={!future.length}><Redo2 size={15} /></button>
          {(['desktop', 'tablet', 'mobile'] as const).map(item => (
            <button className={styles.iconBtn} key={item} onClick={() => setDevice(item)}>
              {item === 'desktop' ? <Monitor size={14} /> : item === 'tablet' ? <Tablet size={14} /> : <Smartphone size={14} />}
            </button>
          ))}
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!dirty || saving} onClick={save}>
            <Save size={14} />
            {saving ? 'Saving…' : dirty ? 'Save •' : 'Save'}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.side}>
          <div className={styles.tabs}>
            <button className={sideTab === 'sections' ? styles.active : ''} onClick={() => setSideTab('sections')}><GripVertical size={13} />Sections</button>
            <button className={sideTab === 'theme' ? styles.active : ''} onClick={() => setSideTab('theme')}><Palette size={13} />Theme</button>
          </div>

          {sideTab === 'sections' ? (
            <>
              <div className={styles.sideSectionsHead}>
                <div>
                  <strong>{page}</strong>
                  <div className={styles.sideSectionsCount}>{current.filter(section => section.enabled !== false).length} visible sections</div>
                </div>
                <button className={styles.iconBtn} onClick={() => setPicker(true)}><Plus size={15} /></button>
              </div>
              <div className={styles.rows}>
                {current.map((section, index) => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDragId(section.id)}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => dropSection(section.id)}
                    className={`${styles.row} ${selectedId === section.id ? styles.active : ''}`}
                  >
                    <button className={styles.rowMain} onClick={() => { setSelectedId(section.id); setDrawer(true); setDrawerTab('content') }}>
                      <GripVertical size={13} />
                      <span>{META[section.type] || section.type.replaceAll('_', ' ')}</span>
                      {index === 0 && <small>MAIN</small>}
                    </button>
                    <button className={styles.rowToggle} onClick={() => { setSelectedId(section.id); setDrawer(true); toggle(section.enabled === false) }}>
                      {section.enabled === false ? <X size={14} /> : <Check size={14} />}
                    </button>
                  </div>
                ))}
              </div>
              <button className={styles.add} onClick={() => setPicker(true)}><Plus size={14} />Add section</button>
            </>
          ) : (
            <div className={styles.sideThemeTab}>
              <Panel title="Brand">
                <Field label="Brand name" value={theme.brandName || ''} onChange={value => commit(templates, { ...theme, brandName: value })} />
                <Field label="Logo URL" value={theme.logoUrl || ''} onChange={value => commit(templates, { ...theme, logoUrl: value })} />
              </Panel>
              <Panel title="Palette">
                <Field label="Primary" value={theme.colors?.primary || '#ff5a1f'} onChange={value => commit(templates, { ...theme, colors: { ...(theme.colors || {}), primary: value } })} />
                <Field label="Background" value={theme.colors?.background || '#ffffff'} onChange={value => commit(templates, { ...theme, colors: { ...(theme.colors || {}), background: value } })} />
                <Field label="Text" value={theme.colors?.text || '#202223'} onChange={value => commit(templates, { ...theme, colors: { ...(theme.colors || {}), text: value } })} />
              </Panel>
            </div>
          )}
        </aside>

        <main className={styles.canvas}>
          <div className={styles.canvasBar}>
            <strong>{page}</strong>
            <span className={styles.canvasBarStatus}>{dirty ? 'Live preview · unsaved changes' : 'Live preview'}</span>
          </div>
          <div className={styles.preview}>
            <iframe
              ref={iframeRef}
              src={PREVIEW_PATH}
              title="Storefront preview"
              className={`${styles.frame} ${frameClass}`}
              style={{ maxWidth, height: previewHeight || '100%', border: 0 }}
              onLoad={() => setPreviewReady(false)}
            />
          </div>
        </main>

        {drawer && selected && (
          <aside className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div>
                <div className={styles.drawerHeadLabel}>Section</div>
                <strong>{META[selected.type] || selected.type}</strong>
              </div>
              <div className={styles.drawerHeadActions}>
                <button className={styles.iconBtn} onClick={() => moveSection(-1)} disabled={selectedIndex <= 0}><ArrowUp size={13} /></button>
                <button className={styles.iconBtn} onClick={() => moveSection(1)} disabled={selectedIndex < 0 || selectedIndex >= current.length - 1}><ArrowDown size={13} /></button>
                <button className={styles.iconBtn} onClick={duplicateSection}><Copy size={13} /></button>
                <button className={styles.iconBtn} onClick={removeSection}><Trash2 size={13} /></button>
                <button className={styles.iconBtn} onClick={() => setDrawer(false)}><X size={15} /></button>
              </div>
            </div>
            <div className={styles.drawerTabs}>
              {(['content', 'design', 'advanced'] as const).map(item => (
                <button key={item} className={drawerTab === item ? styles.active : ''} onClick={() => setDrawerTab(item)}>{item}</button>
              ))}
            </div>
            {drawerTab === 'content' ? (
              <ShopifyThemeInspector section={selected} products={products} collections={collections} onUpdate={patch} onUpdateBlocks={patchBlocks} />
            ) : drawerTab === 'design' ? (
              <Panel title="Design">
                <Field label="Section spacing" value={selected.settings?.spacing ?? 72} type="number" onChange={value => patch({ spacing: value })} />
                <Field label="Content width" value={selected.settings?.contentWidth ?? 1180} type="number" onChange={value => patch({ contentWidth: value })} />
              </Panel>
            ) : (
              <Panel title="Advanced">
                <label className={styles.field}>
                  <span>Show section</span>
                  <input type="checkbox" checked={selected.enabled !== false} onChange={event => toggle(event.target.checked)} />
                </label>
                <label className={styles.field}>
                  <span>Animation</span>
                  <select className={styles.fieldSelect} value={selected.settings?.animation || 'fade-up'} onChange={event => patch({ animation: event.target.value })}>
                    <option value="none">None</option>
                    <option value="fade-up">Fade up</option>
                    <option value="fade">Fade</option>
                    <option value="zoom">Zoom</option>
                  </select>
                </label>
              </Panel>
            )}
          </aside>
        )}
      </div>

      {picker && (
        <div className={styles.pickerOverlay} onMouseDown={() => setPicker(false)}>
          <div className={styles.pickerDialog} onMouseDown={event => event.stopPropagation()}>
            <strong className={styles.pickerTitle}>Add section</strong>
            <div className={styles.pickerList}>
              {Object.entries(META)
                .filter(([key]) => !['announcement', 'header'].includes(key))
                .map(([key, label]) => {
                  const Icon = SECTION_ICONS[key] || LayoutGrid
                  return (
                    <button key={key} className={styles.pickerCard} onClick={() => addSection(key)}>
                      <span className={styles.pickerIcon}><Icon size={20} /></span>
                      <span className={styles.pickerLabel}>{label}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {message && <div className={styles.notice}>{message}</div>}
    </div>
  )
}
