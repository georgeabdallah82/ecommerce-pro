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
  Camera,
  GripVertical,
  HelpCircle,
  History,
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
  ShieldCheck,
  Smartphone,
  Sparkles,
  SplitSquareHorizontal,
  Tablet,
  Timer,
  Trash2,
  TrendingUp,
  Type as TypeIcon,
  Undo2,
  Video,
  X,
} from 'lucide-react'
import ShopifyThemeInspector from '@/components/shopify-theme-inspector'
import ThemeInspectorStyles from '@/components/theme-inspector-styles'
import ThemePublishBar from '@/components/theme-publish-bar'
import { FONT_OPTIONS } from '@/lib/font-options'
import styles from './admin-theme-editor.module.css'

const PREVIEW_PATH = '/admin/online-store/theme-editor/preview'

type AnyMap = Record<string, any>
type Section = { id: string; type: string; enabled?: boolean; settings?: AnyMap; blocks?: AnyMap[] }
type Snapshot = { theme: AnyMap; templates: Record<string, Section[]>; page: string; selectedId: string }
type Props = { initial: { theme: AnyMap; sections: Section[]; navigation: any[]; draft: boolean } }

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
  trust_badges: 'Trust badges',
  countdown: 'Countdown timer',
  stats: 'Stats / counters',
  social_grid: 'Social / Instagram feed',
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
  trust_badges: ShieldCheck,
  countdown: Timer,
  stats: TrendingUp,
  social_grid: Camera,
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
  if (type === 'trust_badges') return { id: makeId(type), type, enabled: true, settings: { ...base }, blocks: [
    { id: makeId('badge'), type: 'badge', settings: { icon: 'truck', heading: 'Free shipping', text: 'On orders over $50' } },
    { id: makeId('badge'), type: 'badge', settings: { icon: 'return', heading: 'Easy returns', text: '30-day window' } },
    { id: makeId('badge'), type: 'badge', settings: { icon: 'lock', heading: 'Secure checkout', text: 'Encrypted payments' } },
    { id: makeId('badge'), type: 'badge', settings: { icon: 'support', heading: '24/7 support', text: 'We are here to help' } },
  ] }
  if (type === 'countdown') return { id: makeId(type), type, enabled: true, settings: { ...base, eyebrow: 'LIMITED TIME', heading: 'Sale ends soon', text: "Don't miss out on this offer.", buttonLabel: 'Shop now', buttonUrl: '/shop', endDate: '' } }
  if (type === 'stats') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Trusted by thousands', columns: 4 }, blocks: [
    { id: makeId('stat'), type: 'stat', settings: { value: '50K+', label: 'Happy customers' } },
    { id: makeId('stat'), type: 'stat', settings: { value: '4.9', label: 'Average rating' } },
    { id: makeId('stat'), type: 'stat', settings: { value: '120+', label: 'Countries shipped' } },
    { id: makeId('stat'), type: 'stat', settings: { value: '24/7', label: 'Customer support' } },
  ] }
  if (type === 'social_grid') return { id: makeId(type), type, enabled: true, settings: { ...base, heading: 'Shop the feed', handle: '@yourbrand', columns: 5 }, blocks: [] }
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

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <div className={styles.colorRow}>
        <input
          type="color"
          value={HEX_RE.test(value) && value.length === 7 ? value : '#000000'}
          onChange={event => { setText(event.target.value); onChange(event.target.value) }}
          className={styles.colorSwatch}
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          value={text}
          onChange={event => { setText(event.target.value); if (HEX_RE.test(event.target.value)) onChange(event.target.value) }}
          className={styles.input}
          placeholder="#000000"
        />
      </div>
    </label>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className={styles.fieldSelect} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function RangeField({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return (
    <label className={styles.field}>
      <span>{label} — {value}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    </label>
  )
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`${styles.field} ${styles.toggleField}`}>
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />
    </label>
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
  const [sideTab, setSideTab] = useState<'sections' | 'theme' | 'history'>('sections')
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
  const [versions, setVersions] = useState<Array<{ id: string; createdAt: string; createdBy: string | null }>>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const confirmAction = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm })
  const [hasDraft, setHasDraft] = useState(initial.draft)
  const [publishing, setPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishError, setPublishError] = useState('')

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
  const patchTheme = (group: string, patches: AnyMap) => {
    commit(templates, { ...theme, [group]: { ...(theme[group] || {}), ...patches } })
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
    confirmAction(`Delete "${META[selected.type] || selected.type.replaceAll('_', ' ')}"? You can undo this from the toolbar.`, () => {
      const list = current.filter(section => section.id !== selected.id)
      const nextId = list[Math.max(0, selectedIndex - 1)]?.id || list[0]?.id || ''
      commit({ ...templates, [page]: list })
      setSelectedId(nextId)
      setDrawer(false)
    })
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
  const switchPage = (nextPage: string) => {
    setPage(nextPage)
    setSelectedId('')
    setDrawer(false)
  }
  const changePage = (nextPage: string) => {
    if (nextPage === page) return
    if (dirty) { confirmAction('You have unsaved changes. Switch templates anyway?', () => switchPage(nextPage)); return }
    switchPage(nextPage)
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
      setHasDraft(true)
      setMessage('Theme saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save theme')
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    if (!hasDraft || publishing) return
    setPublishing(true)
    setPublishMessage('')
    setPublishError('')
    try {
      const response = await fetch('/api/admin/theme/publish', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to publish theme')
      setHasDraft(false)
      setPublishMessage('Published')
      window.setTimeout(() => setPublishMessage(''), 2500)
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Unable to publish theme')
      window.setTimeout(() => setPublishError(''), 4000)
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    if (sideTab !== 'history' || versions.length || versionsLoading) return
    setVersionsLoading(true)
    setVersionsError('')
    fetch('/api/admin/theme/versions', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => { if (Array.isArray(data.versions)) setVersions(data.versions); else throw new Error(data.error || 'Unable to load theme history') })
      .catch(error => setVersionsError(error instanceof Error ? error.message : 'Unable to load theme history'))
      .finally(() => setVersionsLoading(false))
  }, [sideTab, versions.length, versionsLoading])

  const restoreVersion = (id: string) => {
    confirmAction('Restore this version? It will replace your current draft (published content is unaffected until you publish again).', () => performRestore(id))
  }
  const performRestore = async (id: string) => {
    setRestoringId(id)
    setVersionsError('')
    try {
      const response = await fetch(`/api/admin/theme/versions/${id}/restore`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to restore theme version')
      setMessage('Version restored to draft — reloading…')
      window.setTimeout(() => window.location.reload(), 600)
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : 'Unable to restore theme version')
      setRestoringId(null)
    }
  }

  const formatVersionTime = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.round(diffMs / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
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
            <button className={sideTab === 'history' ? styles.active : ''} onClick={() => setSideTab('history')}><History size={13} />History</button>
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
                    onDragOver={event => { event.preventDefault(); if (dragId && dragId !== section.id) setDragOverId(section.id) }}
                    onDragLeave={() => setDragOverId(prev => (prev === section.id ? null : prev))}
                    onDrop={() => { dropSection(section.id); setDragOverId(null) }}
                    onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                    className={`${styles.row} ${selectedId === section.id ? styles.active : ''} ${dragOverId === section.id && dragId !== section.id ? styles.dropTarget : ''}`}
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
          ) : sideTab === 'theme' ? (
            <div className={styles.sideThemeTab}>
              <Panel title="Brand">
                <Field label="Brand name" value={theme.brandName || ''} onChange={value => commit(templates, { ...theme, brandName: value })} />
                <Field label="Logo URL" value={theme.logoUrl || ''} onChange={value => commit(templates, { ...theme, logoUrl: value })} />
                <Field label="Favicon URL" value={theme.faviconUrl || ''} onChange={value => commit(templates, { ...theme, faviconUrl: value })} />
              </Panel>
              <Panel title="Colors">
                <ColorField label="Primary" value={theme.colors?.primary || '#0a0a0a'} onChange={value => patchTheme('colors', { primary: value })} />
                <ColorField label="Secondary" value={theme.colors?.secondary || '#f0f0f0'} onChange={value => patchTheme('colors', { secondary: value })} />
                <ColorField label="Accent" value={theme.colors?.accent || '#d4ff3f'} onChange={value => patchTheme('colors', { accent: value })} />
                <ColorField label="Background" value={theme.colors?.background || '#ffffff'} onChange={value => patchTheme('colors', { background: value })} />
                <ColorField label="Surface" value={theme.colors?.surface || '#f5f5f5'} onChange={value => patchTheme('colors', { surface: value })} />
                <ColorField label="Text" value={theme.colors?.text || '#0a0a0a'} onChange={value => patchTheme('colors', { text: value })} />
                <ColorField label="Muted text" value={theme.colors?.muted || '#6b6b6b'} onChange={value => patchTheme('colors', { muted: value })} />
                <ColorField label="Border" value={theme.colors?.border || '#e5e5e5'} onChange={value => patchTheme('colors', { border: value })} />
                <ColorField label="Button text" value={theme.colors?.buttonText || '#ffffff'} onChange={value => patchTheme('colors', { buttonText: value })} />
                <ColorField label="Announcement bg" value={theme.colors?.announcementBg || '#0a0a0a'} onChange={value => patchTheme('colors', { announcementBg: value })} />
                <ColorField label="Announcement text" value={theme.colors?.announcementText || '#ffffff'} onChange={value => patchTheme('colors', { announcementText: value })} />
                <ColorField label="Sale" value={theme.colors?.sale || '#ff3b30'} onChange={value => patchTheme('colors', { sale: value })} />
              </Panel>
              <Panel title="Typography">
                <SelectField label="Heading font" value={theme.typography?.heading || 'spaceGrotesk'} options={FONT_OPTIONS.map(f => ({ value: f.key, label: f.label }))} onChange={value => patchTheme('typography', { heading: value })} />
                <SelectField label="Body font" value={theme.typography?.body || 'inter'} options={FONT_OPTIONS.map(f => ({ value: f.key, label: f.label }))} onChange={value => patchTheme('typography', { body: value })} />
              </Panel>
              <Panel title="Buttons">
                <RangeField label="Corner radius" value={theme.buttons?.radius ?? 8} min={0} max={32} unit="px" onChange={value => patchTheme('buttons', { radius: value })} />
                <RangeField label="Height" value={theme.buttons?.height ?? 50} min={36} max={64} unit="px" onChange={value => patchTheme('buttons', { height: value })} />
                <ToggleField label="Uppercase label" value={theme.buttons?.uppercase !== false} onChange={value => patchTheme('buttons', { uppercase: value })} />
              </Panel>
              <Panel title="Cards & layout">
                <RangeField label="Card corner radius" value={theme.cards?.radius ?? 14} min={0} max={32} unit="px" onChange={value => patchTheme('cards', { radius: value })} />
                <RangeField label="Section spacing" value={theme.layout?.sectionSpacing ?? 84} min={32} max={160} unit="px" onChange={value => patchTheme('layout', { sectionSpacing: value })} />
                <RangeField label="Max page width" value={theme.layout?.maxWidth ?? 1360} min={960} max={1600} step={20} unit="px" onChange={value => patchTheme('layout', { maxWidth: value })} />
              </Panel>
            </div>
          ) : (
            <div className={styles.sideThemeTab}>
              {versionsLoading && <div className={styles.sideSectionsCount}>Loading history…</div>}
              {versionsError && <div className={styles.sideSectionsCount}>{versionsError}</div>}
              {!versionsLoading && !versionsError && !versions.length && <div className={styles.sideSectionsCount}>No published versions yet. History fills in after your next publish.</div>}
              <div className={styles.rows}>
                {versions.map(version => (
                  <div className={styles.row} key={version.id}>
                    <div className={styles.rowMain}>
                      <History size={13} />
                      <span>
                        {formatVersionTime(version.createdAt)}
                        {version.createdBy && <small> · {version.createdBy}</small>}
                      </span>
                    </div>
                    <button className={styles.rowToggle} disabled={restoringId === version.id} onClick={() => restoreVersion(version.id)} aria-label="Restore this version">
                      {restoringId === version.id ? '…' : <Undo2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
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

      {confirmState && (
        <div className={styles.pickerOverlay} onMouseDown={() => setConfirmState(null)}>
          <div className={styles.confirmDialog} onMouseDown={event => event.stopPropagation()}>
            <p className={styles.confirmMessage}>{confirmState.message}</p>
            <div className={styles.confirmActions}>
              <button className={styles.btn} onClick={() => setConfirmState(null)}>Cancel</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  const action = confirmState.onConfirm
                  setConfirmState(null)
                  action()
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {message && <div className={styles.notice}>{message}</div>}

      <ThemePublishBar draft={hasDraft} publishing={publishing} message={publishMessage} error={publishError} onPublish={publish} />
    </div>
  )
}
