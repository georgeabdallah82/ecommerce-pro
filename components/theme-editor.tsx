'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, GripVertical,
  Image as ImageIcon, Layers3, LayoutTemplate, Menu, Monitor, MoreHorizontal, Palette,
  PanelLeft, Plus, Redo2, Save, Search, Settings2, Smartphone, Sparkles, Trash2, Type,
  Undo2, X, Zap
} from 'lucide-react'

type Block = { id: string; type: string; settings: Record<string, any> }
type Section = { id: string; type: string; enabled: boolean; settings: Record<string, any>; blocks?: Block[] }
type Theme = Record<string, any>
type Snapshot = { theme: Theme; sections: Section[]; navigation: any[] }

const LABELS: Record<string, string> = {
  announcement: 'Announcement bar', header: 'Header', hero: 'Image banner', slideshow: 'Slideshow',
  product_grid: 'Product grid', product_carousel: 'Product carousel', collection_grid: 'Collection list',
  collection_carousel: 'Collection carousel', image_with_text: 'Image with text', promo_grid: 'Multicolumn',
  testimonials: 'Testimonials', logo_list: 'Logo list', faq: 'FAQ', rich_text: 'Rich text', video: 'Video',
  newsletter: 'Email signup', footer: 'Footer'
}
const SECTION_CHOICES = [
  ['hero', 'Image banner'], ['slideshow', 'Slideshow'], ['product_grid', 'Product grid'],
  ['product_carousel', 'Product carousel'], ['collection_grid', 'Collection list'],
  ['collection_carousel', 'Collection carousel'], ['image_with_text', 'Image with text'], ['promo_grid', 'Multicolumn'],
  ['testimonials', 'Testimonials'], ['logo_list', 'Logo list'], ['faq', 'FAQ'], ['rich_text', 'Rich text'],
  ['video', 'Video'], ['newsletter', 'Email signup']
]
const DEVICE_WIDTH: Record<string, number> = { desktop: 1280, tablet: 820, mobile: 390 }

function clone<T>(value: T): T { return structuredClone(value) }
function getPath(obj: any, path: string, fallback = '') { return path.split('.').reduce((a, k) => a?.[k], obj) ?? fallback }
function setPath<T extends Record<string, any>>(obj: T, path: string, value: any): T {
  const next: any = clone(obj); const parts = path.split('.'); let cursor: any = next
  for (let i = 0; i < parts.length - 1; i++) { if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {}; cursor = cursor[parts[i]] }
  cursor[parts.at(-1)!] = value
  return next
}
function safeSections(sections: Section[]) { return Array.isArray(sections) ? sections.map(s => ({ ...s, settings: s?.settings || {}, blocks: Array.isArray(s?.blocks) ? s.blocks : [] })) : [] }
function safeTheme(theme: Theme) { return theme && typeof theme === 'object' ? theme : {} }
function hexToRgb(hex: string) { const clean = (hex || '#000000').replace('#', ''); const full = clean.length === 3 ? clean.split('').map(x => x + x).join('') : clean; const n = Number.parseInt(full, 16); if (Number.isNaN(n)) return '0,0,0'; return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}` }

export default function ThemeEditor({ initial }: { initial: { theme: Theme; sections: Section[]; navigation: any[] } }) {
  const [theme, setTheme] = useState<Theme>(() => safeTheme(clone(initial.theme)))
  const [sections, setSections] = useState<Section[]>(() => safeSections(clone(initial.sections)))
  const [navigation, setNavigation] = useState<any[]>(() => Array.isArray(initial.navigation) ? clone(initial.navigation) : [])
  const [selectedId, setSelectedId] = useState(sections[0]?.id || '')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [template, setTemplate] = useState('Home page')
  const [leftTab, setLeftTab] = useState<'sections' | 'templates' | 'global'>('sections')
  const [inspectorTab, setInspectorTab] = useState<'content' | 'design' | 'animation'>('content')
  const [addOpen, setAddOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [bannerOpen, setBannerOpen] = useState<{ id: string; target: 'desktop' | 'mobile' } | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const snapshotRef = useRef<Snapshot>({ theme, sections, navigation })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentSnapshot = (): Snapshot => ({ theme: clone(theme), sections: clone(sections), navigation: clone(navigation) })
  const commit = (mutate: (s: Snapshot) => Snapshot) => {
    const before = snapshotRef.current
    const after = mutate({ theme: clone(theme), sections: clone(sections), navigation: clone(navigation) })
    setHistory(h => [...h, before].slice(-50)); setFuture([])
    setTheme(after.theme); setSections(after.sections); setNavigation(after.navigation); setDirty(true)
    snapshotRef.current = after
  }

  useEffect(() => { snapshotRef.current = { theme, sections, navigation } }, [theme, sections, navigation])
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])
  useEffect(() => { if (!selectedId && sections[0]) setSelectedId(sections[0].id) }, [selectedId, sections])
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 2200); return () => clearTimeout(t) } }, [notice])

  const selected = useMemo(() => sections.find(s => s.id === selectedId) || null, [sections, selectedId])
  const selectedIndex = useMemo(() => sections.findIndex(s => s.id === selectedId), [sections, selectedId])

  const updateTheme = (path: string, value: any) => commit(s => ({ ...s, theme: setPath(s.theme, path, value) }))
  const patchSection = (patch: Record<string, any>) => selected && commit(s => ({ ...s, sections: s.sections.map(x => x.id === selected.id ? { ...x, settings: { ...x.settings, ...patch } } : x) }))
  const replaceSection = (nextSection: Section) => commit(s => ({ ...s, sections: s.sections.map(x => x.id === nextSection.id ? nextSection : x) }))

  const addSection = (type: string) => {
    const id = `${type}-${Date.now()}`
    const fresh: Section = { id, type, enabled: true, settings: sectionDefaults(type), blocks: defaultBlocks(type) }
    commit(s => { const copy = [...s.sections]; copy.splice(selectedIndex >= 0 ? selectedIndex + 1 : copy.length, 0, fresh); return { ...s, sections: copy } })
    setSelectedId(id); setAddOpen(false)
  }
  const moveSection = (delta: number) => {
    if (selectedIndex < 0) return
    commit(s => { const items = [...s.sections]; const next = selectedIndex + delta; if (next < 0 || next >= items.length) return s; [items[selectedIndex], items[next]] = [items[next], items[selectedIndex]]; return { ...s, sections: items } })
  }
  const duplicateSection = () => {
    if (!selected) return
    const copy = clone(selected); const id = `${selected.type}-${Date.now()}`; copy.id = id; copy.blocks = (copy.blocks || []).map(b => ({ ...b, id: `${b.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }))
    commit(s => { const items = [...s.sections]; items.splice(selectedIndex + 1, 0, copy); return { ...s, sections: items } }); setSelectedId(id)
  }
  const deleteSelected = () => {
    if (!selected) return
    if (!window.confirm(`Remove “${LABELS[selected.type] || selected.type}” from this template?`)) return
    commit(s => ({ ...s, sections: s.sections.filter(x => x.id !== selected.id) }))
    setSelectedId(sections[Math.max(0, selectedIndex - 1)]?.id || sections.find(x => x.id !== selected.id)?.id || '')
  }
  const toggleSection = (id: string) => commit(s => ({ ...s, sections: s.sections.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x) }))

  const undo = () => {
    if (!history.length) return
    const previous = history.at(-1)!; setHistory(h => h.slice(0, -1)); setFuture(f => [...f, currentSnapshot()])
    setTheme(clone(previous.theme)); setSections(clone(previous.sections)); setNavigation(clone(previous.navigation)); setDirty(true); snapshotRef.current = clone(previous)
  }
  const redo = () => {
    if (!future.length) return
    const next = future.at(-1)!; setFuture(f => f.slice(0, -1)); setHistory(h => [...h, currentSnapshot()])
    setTheme(clone(next.theme)); setSections(clone(next.sections)); setNavigation(clone(next.navigation)); setDirty(true); snapshotRef.current = clone(next)
  }

  const save = async (silent = false) => {
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/admin/theme', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme, sections, navigation }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Could not save theme')
      setDirty(false); if (!silent) setNotice('Theme saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save theme') }
    finally { setSaving(false) }
  }
  const saveAndPreview = async () => { await save(); window.open('/', '_blank', 'noopener,noreferrer') }
  const scheduleAutosave = () => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => save(true), 900) }
  useEffect(() => { if (dirty) scheduleAutosave() }, [dirty])

  const applyPreset = (name: string) => {
    const presets: Record<string, Partial<Theme>> = {
      Vibrant: { colors: { ...theme.colors, background: '#fff8f2', surface: '#ffffff', text: '#191512', muted: '#746b64', primary: '#ff4d2e', secondary: '#fff0ea', accent: '#0f8f67', border: '#eadfd8', buttonText: '#ffffff', announcementBg: '#171310', announcementText: '#ffffff' }, buttons: { ...theme.buttons, radius: 14, shadow: 'soft' } },
      Midnight: { colors: { ...theme.colors, background: '#0b0c10', surface: '#13151b', text: '#f5f7fb', muted: '#9ea6b7', primary: '#8b5cf6', secondary: '#1b1e28', accent: '#6ee7b7', border: '#2a2f3c', buttonText: '#ffffff', announcementBg: '#ffffff', announcementText: '#0b0c10' }, buttons: { ...theme.buttons, radius: 14, shadow: 'soft' } },
      Editorial: { colors: { ...theme.colors, background: '#f7f3ec', surface: '#fffdf8', text: '#201d19', muted: '#756f67', primary: '#20201f', secondary: '#ece4d8', accent: '#a4553c', border: '#ded5c8', buttonText: '#ffffff', announcementBg: '#201d19', announcementText: '#ffffff' }, typography: { ...theme.typography, heading: 'Georgia', body: 'Inter', letterSpacing: 'tight' }, buttons: { ...theme.buttons, radius: 4, shadow: 'none' } },
      Minimal: { colors: { ...theme.colors, background: '#ffffff', surface: '#ffffff', text: '#121212', muted: '#707070', primary: '#121212', secondary: '#f5f5f5', accent: '#121212', border: '#e5e5e5', buttonText: '#ffffff', announcementBg: '#121212', announcementText: '#ffffff' }, buttons: { ...theme.buttons, radius: 8, shadow: 'none' } }
    }
    const preset = presets[name]
    if (!preset) return
    commit(s => ({ ...s, theme: { ...s.theme, ...preset, presets: { ...(s.theme.presets || {}), active: name } } }))
  }

  const themeVars = {
    '--studio-bg': theme.colors?.background || '#fff', '--studio-surface': theme.colors?.surface || '#fff',
    '--studio-text': theme.colors?.text || '#111', '--studio-muted': theme.colors?.muted || '#666',
    '--studio-primary': theme.colors?.primary || '#111', '--studio-border': theme.colors?.border || '#e5e5e5'
  } as CSSProperties

  return <div className="themeStudioPro" style={themeVars}>
    <header className="tsProTop">
      <div className="tsProBrand"><Link href="/admin/online-store" className="tsIconBtn" title="Back"><ChevronLeft size={18}/></Link><div><div className="tsEyebrow">ONLINE STORE</div><div className="tsProTitle">Theme Studio <span className="tsDraftBadge">{dirty ? 'Unsaved' : 'Saved'}</span></div></div></div>
      <div className="tsTemplateBar"><select value={template} onChange={e => setTemplate(e.target.value)}><option>Home page</option><option>Products</option><option>Product</option><option>Collections</option><option>Collection</option><option>Cart</option><option>Pages</option><option>Blog</option></select><span className="tsTemplateHint">Template preview</span></div>
      <div className="tsTopActions"><button className="tsIconBtn" onClick={undo} disabled={!history.length} title="Undo"><Undo2 size={16}/></button><button className="tsIconBtn" onClick={redo} disabled={!future.length} title="Redo"><Redo2 size={16}/></button><div className="tsDevice"><button className={device==='desktop'?'active':''} onClick={() => setDevice('desktop')} title="Desktop"><Monitor size={16}/></button><button className={device==='tablet'?'active':''} onClick={() => setDevice('tablet')} title="Tablet"><PanelLeft size={16}/></button><button className={device==='mobile'?'active':''} onClick={() => setDevice('mobile')} title="Mobile"><Smartphone size={16}/></button></div><button className="tsSecondaryBtn" onClick={saveAndPreview}><Eye size={15}/> Preview</button><button className="tsPrimaryBtn" onClick={() => save()} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save'}</button></div>
    </header>
    <div className="tsProBody">
      <aside className="tsProLeft">
        <div className="tsLeftNav"><button className={leftTab==='sections'?'active':''} onClick={() => setLeftTab('sections')}><Layers3 size={14}/> Sections</button><button className={leftTab==='templates'?'active':''} onClick={() => setLeftTab('templates')}><LayoutTemplate size={14}/> Templates</button><button className={leftTab==='global'?'active':''} onClick={() => setLeftTab('global')}><Palette size={14}/> Theme</button></div>
        {leftTab==='sections' && <>
          <div className="tsPanelHeading"><div><div className="tsPanelTitle">{template}</div><div className="tsPanelMeta">{sections.filter(s=>s.enabled).length} visible sections</div></div><button className="tsRoundAdd" onClick={() => setAddOpen(v => !v)} title="Add section"><Plus size={16}/></button></div>
          <div className="tsSectionList">{sections.map((s, i) => <div key={s.id} className={`tsProRow ${selectedId===s.id?'selected':''} ${!s.enabled?'mutedRow':''}`}><button className="tsRowMain" onClick={() => { setSelectedId(s.id); setInspectorTab('content') }}><GripVertical size={14}/><span>{LABELS[s.type] || s.type}</span><span className="tsRowTag">{i===0?'MAIN':''}</span></button><div className="tsRowControls"><button onClick={() => { setSelectedId(s.id); if(i>0) { setHistory(h=>[...h,currentSnapshot()].slice(-50)); commit(snap => { const arr=[...snap.sections]; [arr[i-1],arr[i]]=[arr[i],arr[i-1]]; return {...snap,sections:arr} }) } }} disabled={i===0} title="Move up"><ArrowUp size={12}/></button><button onClick={() => { setSelectedId(s.id); if(i<sections.length-1) { setHistory(h=>[...h,currentSnapshot()].slice(-50)); commit(snap => { const arr=[...snap.sections]; [arr[i],arr[i+1]]=[arr[i+1],arr[i]]; return {...snap,sections:arr} }) } }} disabled={i===sections.length-1} title="Move down"><ArrowDown size={12}/></button><button onClick={() => { setSelectedId(s.id); toggleSection(s.id) }} title={s.enabled?'Hide':'Show'}>{s.enabled?'●':'○'}</button></div></div>)}</div>
          {addOpen && <div className="tsAddPanel"><div className="tsSmallCaps">ADD SECTION</div><div className="tsAddGrid">{SECTION_CHOICES.map(([type,label]) => <button key={type} onClick={() => addSection(type)}><Plus size={13}/><span>{label}</span></button>)}</div></div>}
          <div className="tsLeftBottom"><Link href="/admin/online-store/navigation"><Menu size={15}/> Navigation</Link><Link href="/admin/media"><ImageIcon size={15}/> Media Library</Link><Link href="/admin/settings"><Settings2 size={15}/> Store settings</Link></div>
        </>}
        {leftTab==='templates' && <TemplatePanel template={template} setTemplate={setTemplate}/>} 
        {leftTab==='global' && <ThemeSettings theme={theme} updateTheme={updateTheme} applyPreset={applyPreset}/>} 
      </aside>
      <main className="tsProCenter">
        <div className="tsPreviewTop"><div><span className="tsEyebrow">LIVE CANVAS</span><strong>{template}</strong></div><div className="tsPreviewTopRight"><span className="tsLiveDot">● Live</span><button className="tsTinyBtn"><MoreHorizontal size={15}/></button></div></div>
        <PreviewCanvas theme={theme} sections={sections} navigation={navigation} selectedId={selectedId} setSelectedId={setSelectedId} device={device}/>
      </main>
      <aside className="tsProRight">
        {!selected ? <div className="tsEmpty"><Zap size={24}/><strong>Select a section</strong><span>Choose a section from the canvas or left panel to customize it.</span></div> : <InspectorShell section={selected} tab={inspectorTab} setTab={setInspectorTab} update={patchSection} setSection={replaceSection} onDuplicate={duplicateSection} onDelete={deleteSelected} onMoveUp={() => moveSection(-1)} onMoveDown={() => moveSection(1)} media={() => setMediaOpen(true)} openBanner={(target: 'desktop' | 'mobile') => setBannerOpen({ id: selected.id, target })} />}
      </aside>
    </div>
    {notice && <div className="tsToast success">{notice}</div>}
    {error && <div className="tsToast error">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
    {mediaOpen && selected && <MediaPicker onClose={() => setMediaOpen(false)} onPick={url => { patchSection({ imageUrl: url }); setMediaOpen(false) }}/>} 
    {bannerOpen && selected && <BannerEditor section={selected} target={bannerOpen.target} onClose={() => setBannerOpen(null)} onChange={patchSection}/>} 
  </div>
}

function TemplatePanel({ template, setTemplate }: { template: string; setTemplate: (v: string) => void }) {
  const items = ['Home page','Products','Product','Collections','Collection','Cart','Pages','Blog']
  return <div className="tsTemplatePanel"><div className="tsPanelIntro"><span>THEME TEMPLATES</span><strong>Design each page type</strong><p>Switch templates without changing your live store. Each template uses the same section system.</p></div>{items.map(item => <button key={item} className={template===item?'active':''} onClick={() => setTemplate(item)}><span>{item}</span><ChevronRight size={15}/></button>)}</div>
}

function ThemeSettings({ theme, updateTheme, applyPreset }: { theme: Theme; updateTheme: (p:string,v:any)=>void; applyPreset:(name:string)=>void }) {
  return <div className="tsGlobalSettings">
    <div className="tsPanelIntro"><span>GLOBAL DESIGN SYSTEM</span><strong>Theme controls</strong><p>Everything here feeds the storefront. No code edits required.</p></div>
    <SettingCard title="Presets" icon={<Sparkles size={15}/>}><div className="tsPresetGrid">{['Vibrant','Midnight','Editorial','Minimal'].map(p => <button key={p} className={theme.presets?.active===p?'active':''} onClick={() => applyPreset(p)}><span>{p}</span><small>{p==='Vibrant'?'Energetic':p==='Midnight'?'Premium dark':p==='Editorial'?'Fashion editorial':'Quiet luxury'}</small></button>)}</div></SettingCard>
    <SettingCard title="Brand" icon={<Type size={15}/>}><Field label="Brand name" value={theme.brandName || ''} onChange={v => updateTheme('brandName', v)}/><Field label="Logo URL" value={theme.logoUrl || ''} onChange={v => updateTheme('logoUrl', v)}/></SettingCard>
    <SettingCard title="Colors" icon={<Palette size={15}/>}><div className="tsColorGrid">{[['Background','colors.background'],['Surface','colors.surface'],['Text','colors.text'],['Primary','colors.primary'],['Secondary','colors.secondary'],['Accent','colors.accent'],['Border','colors.border'],['Sale','colors.sale'],['Announcement','colors.announcementBg']].map(([label,path]) => <ColorField key={path} label={label} value={getPath(theme,path,'#000000')} onChange={v => updateTheme(path,v)}/>)}</div></SettingCard>
    <SettingCard title="Typography" icon={<Type size={15}/>}><div className="tsTwo"><Select label="Heading font" value={theme.typography?.heading || 'Inter'} options={['Inter','Manrope','DM Sans','Poppins','Georgia','Playfair Display']} onChange={v => updateTheme('typography.heading',v)}/><Select label="Body font" value={theme.typography?.body || 'Inter'} options={['Inter','Manrope','DM Sans','Poppins','Arial','Georgia']} onChange={v => updateTheme('typography.body',v)}/></div><div className="tsTwo"><Select label="Heading weight" value={String(theme.typography?.headingWeight || 700)} options={['500','600','700','800','900']} onChange={v => updateTheme('typography.headingWeight',v)}/><Select label="Body weight" value={String(theme.typography?.bodyWeight || 400)} options={['400','450','500','600']} onChange={v => updateTheme('typography.bodyWeight',v)}/></div><Range label="Type scale" value={Number(theme.typography?.scale || 100)} min={90} max={125} step={5} suffix="%" onChange={v => updateTheme('typography.scale',String(v))}/></SettingCard>
    <SettingCard title="Layout" icon={<LayoutTemplate size={15}/>}><Range label="Max width" value={Number(theme.layout?.maxWidth || 1360)} min={960} max={1680} step={10} suffix="px" onChange={v => updateTheme('layout.maxWidth',v)}/><Range label="Page gutter" value={Number(theme.layout?.pageGutter || 28)} min={12} max={64} step={2} suffix="px" onChange={v => updateTheme('layout.pageGutter',v)}/><Range label="Section spacing" value={Number(theme.layout?.sectionSpacing || 84)} min={24} max={160} step={4} suffix="px" onChange={v => updateTheme('layout.sectionSpacing',v)}/></SettingCard>
    <SettingCard title="Buttons & cards" icon={<Zap size={15}/>}><div className="tsTwo"><Select label="Button style" value={theme.buttons?.style || 'solid'} options={['solid','outline','soft','text']} onChange={v => updateTheme('buttons.style',v)}/><Select label="Button hover" value={theme.buttons?.hover || 'lift'} options={['none','lift','darken','grow','shine']} onChange={v => updateTheme('buttons.hover',v)}/></div><Range label="Button radius" value={Number(theme.buttons?.radius || 12)} min={0} max={32} step={1} suffix="px" onChange={v => updateTheme('buttons.radius',v)}/><Range label="Card radius" value={Number(theme.cards?.radius || 20)} min={0} max={32} step={1} suffix="px" onChange={v => updateTheme('cards.radius',v)}/></SettingCard>
    <SettingCard title="Motion" icon={<Sparkles size={15}/>}><Toggle label="Enable animations" value={Boolean(theme.animations?.enabled ?? true)} onChange={v => updateTheme('animations.enabled',v)}/><Select label="Reveal style" value={theme.animations?.reveal || 'fade-up'} options={['fade','fade-up','slide','zoom','none']} onChange={v => updateTheme('animations.reveal',v)}/><Range label="Duration" value={Number(theme.animations?.duration || 420)} min={150} max={1000} step={10} suffix="ms" onChange={v => updateTheme('animations.duration',v)}/><Toggle label="Respect reduced motion" value={Boolean(theme.animations?.reducedMotionRespect ?? true)} onChange={v => updateTheme('animations.reducedMotionRespect',v)}/></SettingCard>
  </div>
}

function InspectorShell({ section, tab, setTab, update, setSection, onDuplicate, onDelete, onMoveUp, onMoveDown, media, openBanner }: any) {
  return <div className="tsInspector"><div className="tsInspectorHead"><div><span className="tsEyebrow">SECTION</span><h2>{LABELS[section.type] || section.type}</h2></div><div className="tsInspectorActions"><button onClick={onMoveUp} title="Move up"><ArrowUp size={14}/></button><button onClick={onMoveDown} title="Move down"><ArrowDown size={14}/></button><button onClick={onDuplicate} title="Duplicate"><Copy size={14}/></button><button className="danger" onClick={onDelete} title="Delete"><Trash2 size={14}/></button></div></div><div className="tsInspectorTabs"><button className={tab==='content'?'active':''} onClick={() => setTab('content')}>Content</button><button className={tab==='design'?'active':''} onClick={() => setTab('design')}>Design</button><button className={tab==='animation'?'active':''} onClick={() => setTab('animation')}>Motion</button></div>{tab==='content' && <ContentInspector section={section} update={update} media={media} openBanner={openBanner}/>} {tab==='design' && <DesignInspector section={section} update={update}/>} {tab==='animation' && <MotionInspector section={section} update={update}/>}</div>
}

function ContentInspector({ section, update, media, openBanner }: any) {
  const s = section.settings || {}
  if (section.type === 'hero') return <div className="tsInspectorBody"><div className="tsMediaHero"><div><span className="tsEyebrow">IMAGE BANNER</span><strong>{s.desktopImageUrl || s.imageUrl ? 'Image selected' : 'No image selected'}</strong><p>Desktop and mobile crops can be controlled separately.</p></div><button className="tsPrimaryBtn" onClick={() => openBanner('desktop')}><ImageIcon size={14}/> Edit media</button></div><Field label="Eyebrow" value={s.eyebrow || ''} onChange={v => update({ eyebrow:v })}/><TextArea label="Heading" value={s.heading || ''} onChange={v => update({ heading:v })}/><TextArea label="Supporting text" value={s.text || ''} onChange={v => update({ text:v })}/><div className="tsTwo"><Field label="Primary button" value={s.buttonLabel || ''} onChange={v => update({ buttonLabel:v })}/><Field label="Button URL" value={s.buttonUrl || ''} onChange={v => update({ buttonUrl:v })}/></div><div className="tsTwo"><Field label="Secondary button" value={s.secondaryLabel || ''} onChange={v => update({ secondaryLabel:v })}/><Field label="Secondary URL" value={s.secondaryUrl || ''} onChange={v => update({ secondaryUrl:v })}/></div></div>
  if (section.type.includes('product')) return <div className="tsInspectorBody"><Field label="Heading" value={s.heading || ''} onChange={v => update({ heading:v })}/><Field label="Subheading" value={s.subheading || ''} onChange={v => update({ subheading:v })}/><div className="tsTwo"><Range label="Products" value={Number(s.limit || 8)} min={2} max={16} step={1} onChange={v => update({ limit:v })}/><Range label="Columns" value={Number(s.columns || 4)} min={2} max={6} step={1} onChange={v => update({ columns:v })}/></div><Toggle label="Show view all" value={Boolean(s.showViewAll ?? true)} onChange={v => update({ showViewAll:v })}/></div>
  if (section.type.includes('collection')) return <div className="tsInspectorBody"><Field label="Heading" value={s.heading || ''} onChange={v => update({ heading:v })}/><Field label="Subheading" value={s.subheading || ''} onChange={v => update({ subheading:v })}/><div className="tsTwo"><Range label="Collections" value={Number(s.limit || 4)} min={2} max={8} step={1} onChange={v => update({ limit:v })}/><Range label="Columns" value={Number(s.columns || 4)} min={2} max={6} step={1} onChange={v => update({ columns:v })}/></div></div>
  if (section.type === 'announcement') return <div className="tsInspectorBody"><Toggle label="Enabled" value={Boolean(s.enabled ?? true)} onChange={v => update({ enabled:v })}/><Field label="Message" value={s.text || 'Free shipping on orders over $50'} onChange={v => update({ text:v })}/><Field label="Link" value={s.link || ''} onChange={v => update({ link:v })}/><Select label="Position" value={s.position || 'above'} options={['above','below']} onChange={v => update({ position:v })}/><Toggle label="Marquee" value={Boolean(s.autoplay ?? false)} onChange={v => update({ autoplay:v })}/></div>
  if (section.type === 'image_with_text') return <div className="tsInspectorBody"><Field label="Eyebrow" value={s.eyebrow || ''} onChange={v => update({ eyebrow:v })}/><TextArea label="Heading" value={s.heading || ''} onChange={v => update({ heading:v })}/><TextArea label="Text" value={s.text || ''} onChange={v => update({ text:v })}/><Field label="Button" value={s.buttonLabel || ''} onChange={v => update({ buttonLabel:v })}/><button className="tsSecondaryBtn full" onClick={media}><ImageIcon size={14}/> Choose image</button></div>
  if (section.type === 'newsletter') return <div className="tsInspectorBody"><Field label="Heading" value={s.heading || ''} onChange={v => update({ heading:v })}/><TextArea label="Text" value={s.text || ''} onChange={v => update({ text:v })}/><Field label="Button" value={s.buttonLabel || 'Subscribe'} onChange={v => update({ buttonLabel:v })}/><Select label="Style" value={s.background || 'primary'} options={['primary','surface','secondary','dark']} onChange={v => update({ background:v })}/></div>
  return <div className="tsInspectorBody"><Field label="Heading" value={s.heading || ''} onChange={v => update({ heading:v })}/><TextArea label="Text" value={s.text || ''} onChange={v => update({ text:v })}/></div>
}

function DesignInspector({ section, update }: any) {
  const s = section.settings || {}
  return <div className="tsInspectorBody"><Range label="Section top/bottom space" value={Number(s.spacing || 84)} min={0} max={180} step={4} suffix="px" onChange={v => update({ spacing:v })}/><Range label="Content width" value={Number(s.contentWidth || 1200)} min={640} max={1500} step={20} suffix="px" onChange={v => update({ contentWidth:v })}/>{section.type==='hero' && <><Select label="Content position" value={s.contentPosition || 'center-left'} options={['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right']} onChange={v => update({ contentPosition:v })}/><Select label="Overlay style" value={s.overlayStyle || 'solid'} options={['none','solid','bottom-gradient','full-gradient','soft-vignette']} onChange={v => update({ overlayStyle:v })}/><Range label="Overlay intensity" value={Math.round(Number(s.overlay || 0.25)*100)} min={0} max={80} step={5} suffix="%" onChange={v => update({ overlay:v/100 })}/><ColorField label="Overlay color" value={s.overlayColor || '#000000'} onChange={v => update({ overlayColor:v })}/><Toggle label="Content glass panel" value={Boolean(s.contentBox)} onChange={v => update({ contentBox:v })}/></>}</div>
}

function MotionInspector({ section, update }: any) { const s = section.settings || {}; return <div className="tsInspectorBody"><Toggle label="Animate section" value={s.animation !== 'none'} onChange={v => update({ animation:v ? 'fade-up':'none' })}/><Select label="Reveal" value={s.animation || 'fade-up'} options={['fade','fade-up','slide','zoom','none']} onChange={v => update({ animation:v })}/><Toggle label="Parallax image" value={Boolean(s.parallax)} onChange={v => update({ parallax:v })}/></div> }

function PreviewCanvas({ theme, sections, navigation, selectedId, setSelectedId, device }: any) {
  const visible = sections.filter((s:Section) => s.enabled)
  const css: CSSProperties = { '--preview-bg': theme.colors?.background || '#fff', '--preview-surface': theme.colors?.surface || '#fff', '--preview-text': theme.colors?.text || '#111', '--preview-muted': theme.colors?.muted || '#666', '--preview-primary': theme.colors?.primary || '#111', '--preview-border': theme.colors?.border || '#e5e5e5', '--preview-card-radius': `${theme.cards?.radius ?? 18}px`, '--preview-btn-radius': `${theme.buttons?.radius ?? 12}px`, '--preview-heading-font': theme.typography?.heading || 'Inter', '--preview-body-font': theme.typography?.body || 'Inter', '--preview-scale': `${Number(theme.typography?.scale || 100)/100}`, '--preview-motion': `${theme.animations?.duration || 420}ms`, '--preview-max': `${theme.layout?.maxWidth || 1360}px` } as CSSProperties
  return <div className={`tsCanvasShell device-${device}`}><div className="tsBrowserBar"><span/><span/><span/><div>yourstore.local</div><span/><span/><span/></div><div className="tsCanvasViewport"><div className="tsStoreCanvas" style={{ ...css, width: DEVICE_WIDTH[device] }}><PreviewHeader theme={theme} navigation={navigation}/>{visible.map((s:Section) => <div key={s.id} className={`tsPreviewSection ${selectedId===s.id?'selected':''}`} onClick={() => setSelectedId(s.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key==='Enter' || e.key===' ') setSelectedId(s.id) }}><PreviewSection section={s} theme={theme}/><div className="tsSectionOverlay"><span>{LABELS[s.type] || s.type}</span><button onClick={e => {e.stopPropagation();setSelectedId(s.id)}}>Edit</button></div></div>)}<PreviewFooter theme={theme}/></div></div></div>
}

function PreviewHeader({ theme, navigation }: any) { return <div className="tsPreviewHeader"><strong>{theme.brandName || 'Your Store'}</strong><nav>{(navigation || []).map((n:any,i:number)=><span key={n.id || i}>{n.label}</span>)}</nav></div> }
function PreviewFooter({ theme }: any) { return <div className="tsPreviewFooter"><div className="tsFooterCols"><div><strong>{theme.brandName || 'Your Store'}</strong><span>{theme.footer?.text || 'Premium shopping experience.'}</span></div><div><strong>Customer care</strong><span>Shipping · Returns · Contact</span></div><div><strong>Follow</strong><span>Instagram · Facebook · TikTok</span></div></div></div> }
function PreviewSection({ section, theme }: any) { const s=section.settings || {}; if(section.type==='hero'||section.type==='slideshow') return <div className="tsPreviewHero" style={{backgroundImage:s.imageUrl?`url(${s.imageUrl})`:undefined}}><div className="tsHeroShade"/><div className="tsHeroContent"><span>{s.eyebrow || 'Featured collection'}</span><h2>{s.heading || 'A storefront that feels like your brand'}</h2><p>{s.text || 'Build polished pages with a visual editor.'}</p><div><button>{s.buttonLabel || 'Shop now'}</button>{s.secondaryLabel&&<button className="secondary">{s.secondaryLabel}</button>}</div></div></div>; if(section.type.includes('product')) return <div className="tsPreviewGrid"><div className="tsPreviewSectionHead"><div><span>FEATURED</span><h3>{s.heading || 'Featured products'}</h3><p>{s.subheading || 'Best sellers from your catalog.'}</p></div></div><div className="tsMockProductGrid">{Array.from({length:Number(s.limit||4)}).map((_,i)=><div className="tsMockProduct" key={i}><div className="tsMockImage"/><strong>Product {i+1}</strong><span>$39.00</span></div>)}</div></div>; if(section.type.includes('collection')) return <div className="tsPreviewGrid"><div className="tsPreviewSectionHead"><div><span>COLLECTIONS</span><h3>{s.heading || 'Shop collections'}</h3><p>{s.subheading || 'Explore curated categories.'}</p></div></div><div className="tsMockCollectionGrid">{Array.from({length:Number(s.limit||4)}).map((_,i)=><div className="tsMockCollection" key={i}><div className="tsMockImage"/><strong>Collection {i+1}</strong></div>)}</div></div>; return <div className="tsPreviewGeneric"><span>{LABELS[section.type] || 'Section'}</span><h3>{s.heading || 'Section heading'}</h3><p>{s.text || 'Edit this section from the inspector.'}</p></div> }

function sectionDefaults(type:string) { const base:any={}; if(type==='hero'||type==='slideshow') return {eyebrow:'Featured collection',heading:'A storefront that feels like your brand',text:'Build polished pages with a visual editor.',buttonLabel:'Shop now',buttonUrl:'/shop',secondaryLabel:'',secondaryUrl:'',overlay:0.25,overlayColor:'#000000',contentPosition:'center-left'}; if(type.includes('product')) return {heading:'Featured products',subheading:'Best sellers from your catalog.',limit:8,columns:4,showViewAll:true}; if(type.includes('collection')) return {heading:'Shop collections',subheading:'Explore curated categories.',limit:4,columns:4}; if(type==='announcement') return {text:'Free shipping on orders over $50',link:'',position:'above',autoplay:false}; if(type==='newsletter') return {heading:'Stay in the loop',text:'New products, drops and offers. Straight to your inbox.',buttonLabel:'Subscribe',background:'primary'}; return {heading:LABELS[type] || 'Section heading',text:'Edit this section from the inspector.'} }
function defaultBlocks(_type:string) { return [] }

function SettingCard({ title, icon, children }: { title:string; icon:ReactNode; children:ReactNode }) { return <div className="tsSettingCard"><div className="tsSettingHead">{icon}<strong>{title}</strong></div>{children}</div> }
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <label className="tsField"><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)}/></label> }
function TextArea({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <label className="tsField"><span>{label}</span><textarea value={value} onChange={e=>onChange(e.target.value)}/></label> }
function Select({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(v:string)=>void}) { return <label className="tsField"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label> }
function Range({label,value,min,max,step,suffix,onChange}:{label:string;value:number;min:number;max:number;step:number;suffix?:string;onChange:(v:number)=>void}) { return <label className="tsRange"><span>{label}<b>{value}{suffix||''}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={e=>onChange(Number(e.target.value))}/></label> }
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}) { return <label className="tsToggle"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label> }
function ColorField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <label className="tsColorField"><span>{label}</span><input type="color" value={value} onChange={e=>onChange(e.target.value)}/><input value={value} onChange={e=>onChange(e.target.value)} /></label> }
function MediaPicker({onClose,onPick}:{onClose:()=>void;onPick:(url:string)=>void}) { const [url,setUrl]=useState(''); return <div className="tsModal"><div className="tsModalCard"><div className="tsModalHead"><strong>Media library</strong><button onClick={onClose}><X size={15}/></button></div><div className="tsModalBody"><Field label="Image URL" value={url} onChange={setUrl}/><button className="tsPrimaryBtn full" onClick={() => url && onPick(url)}>Use image</button></div></div></div> }
function BannerEditor({section,target,onClose,onChange}:{section:Section;target:'desktop'|'mobile';onClose:()=>void;onChange:(patch:Record<string,any>)=>void}) { const s=section.settings||{}; const key=target==='desktop'?'desktopImageUrl':'mobileImageUrl'; return <div className="tsModal"><div className="tsModalCard"><div className="tsModalHead"><strong>{target==='desktop'?'Desktop':'Mobile'} image</strong><button onClick={onClose}><X size={15}/></button></div><div className="tsModalBody"><Field label="Image URL" value={s[key]||s.imageUrl||''} onChange={v => onChange({ [key]: v })}/><button className="tsPrimaryBtn full" onClick={onClose}>Done</button></div></div></div> }
