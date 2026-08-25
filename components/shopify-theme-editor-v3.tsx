'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Eye, GripVertical, Image as ImageIcon, Monitor, Plus, Redo2, Save, Search, Settings2, Smartphone, Tablet, Trash2, Undo2, X } from 'lucide-react'
import StorefrontSections from '@/components/storefront-sections'
import ShopifyThemeInspector from '@/components/shopify-theme-inspector'
import styles from './shopify-theme-editor-v3.module.css'

type Section = { id: string; type: string; enabled?: boolean; settings?: Record<string, any>; blocks?: any[] }
type Theme = Record<string, any>
type Snapshot = { theme: Theme; template: string; sections: Section[]; navigation: any[]; selectedId: string }

const TEMPLATES = ['Home page', 'Products', 'Product', 'Collections', 'Collection', 'Cart', 'Pages', 'Blog']
const META: Record<string, { label: string; category: string; description: string }> = {
  hero: { label: 'Image banner', category: 'Hero & media', description: 'Large visual banner with copy and calls to action.' },
  slideshow: { label: 'Slideshow', category: 'Hero & media', description: 'Rotating campaign slides.' },
  video: { label: 'Video', category: 'Hero & media', description: 'Video or poster image section.' },
  image_with_text: { label: 'Image with text', category: 'Hero & media', description: 'Split editorial image and content.' },
  product_grid: { label: 'Featured collection', category: 'Products', description: 'Show products in a curated grid.' },
  product_carousel: { label: 'Featured collection carousel', category: 'Products', description: 'Scrollable product collection.' },
  featured_product: { label: 'Featured product', category: 'Products', description: 'Highlight one product.' },
  product_recommendations: { label: 'Product recommendations', category: 'Products', description: 'Related products on product pages.' },
  collection_grid: { label: 'Collection list', category: 'Collections', description: 'Visual collection cards.' },
  collection_carousel: { label: 'Collection carousel', category: 'Collections', description: 'Scrollable collection cards.' },
  main_collection_banner: { label: 'Collection banner', category: 'Collections', description: 'Collection title and intro.' },
  main_collection_grid: { label: 'Collection products', category: 'Collections', description: 'Products for the current collection.' },
  rich_text: { label: 'Rich text', category: 'Content', description: 'Text-led editorial content.' },
  multicolumn: { label: 'Multicolumn', category: 'Content', description: 'Feature or benefit cards.' },
  testimonials: { label: 'Testimonials', category: 'Content', description: 'Customer quotes and social proof.' },
  logo_list: { label: 'Logo list', category: 'Content', description: 'Partner or press logos.' },
  faq: { label: 'Collapsible content', category: 'Content', description: 'Expandable questions and answers.' },
  newsletter: { label: 'Email signup banner', category: 'Content', description: 'Newsletter signup section.' },
  announcement: { label: 'Announcement bar', category: 'Header', description: 'Storewide promotion or notice.' },
  header: { label: 'Header', category: 'Header', description: 'Logo, navigation and actions.' },
  footer: { label: 'Footer', category: 'Footer', description: 'Footer navigation and policies.' },
  main_product: { label: 'Product', category: 'Products', description: 'Main product information and purchase controls.' },
}
const PICKER = Object.keys(META).filter(key => !['announcement','header','footer','main_product'].includes(key))
const clone = <T,>(value: T): T => structuredClone(value)
const labelFor = (type: string) => META[type]?.label || type.replaceAll('_', ' ')
const rowsOf = (value: any) => Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : Array.isArray(value?.products) ? value.products : []

function fallbackTemplate(key: string, source: Section[]) {
  if (key === 'Home page') return clone(source)
  if (key === 'Product') return [
    { id:'product-ann', type:'announcement', enabled:true, settings:{ text:'Free shipping on orders over $50' } },
    { id:'product-head', type:'header', enabled:true, settings:{} },
    { id:'product-main', type:'main_product', enabled:true, settings:{} },
    { id:'product-recs', type:'product_recommendations', enabled:true, settings:{ heading:'You may also like', limit:4, columns:4 } },
    { id:'product-foot', type:'footer', enabled:true, settings:{} },
  ] as Section[]
  if (key === 'Collection') return [
    { id:'collection-ann', type:'announcement', enabled:true, settings:{ text:'Free shipping on orders over $50' } },
    { id:'collection-head', type:'header', enabled:true, settings:{} },
    { id:'collection-banner', type:'main_collection_banner', enabled:true, settings:{ heading:'Collection' } },
    { id:'collection-grid', type:'main_collection_grid', enabled:true, settings:{ heading:'Products', limit:24, columns:4 } },
    { id:'collection-foot', type:'footer', enabled:true, settings:{} },
  ] as Section[]
  return [
    { id:`${key}-intro`, type:'rich_text', enabled:true, settings:{ eyebrow:key.toUpperCase(), heading:key, text:'Build this template from the sections below.' } },
    { id:`${key}-products`, type:'product_grid', enabled:true, settings:{ heading:'Featured products', limit:8, columns:4 } },
    { id:`${key}-footer`, type:'footer', enabled:true, settings:{} },
  ] as Section[]
}

export default function ShopifyThemeEditorV3({ initial }: { initial: { theme: Theme; sections: Section[]; navigation: any[] } }) {
  const initialTemplate = String(initial.theme?.editorTemplateKey || 'Home page')
  const initialSections = clone(initial.theme?.editorTemplates?.[initialTemplate] || initial.sections || [])
  const [theme, setTheme] = useState<Theme>(() => clone(initial.theme || {}))
  const [navigation, setNavigation] = useState<any[]>(() => clone(initial.navigation || []))
  const [template, setTemplate] = useState(initialTemplate)
  const [sections, setSections] = useState<Section[]>(initialSections)
  const [selectedId, setSelectedId] = useState(initialSections[0]?.id || '')
  const [device, setDevice] = useState<'desktop'|'tablet'|'mobile'>('desktop')
  const [drawerOpen, setDrawerOpen] = useState(Boolean(initialSections[0]))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dragId, setDragId] = useState<string|null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])

  const selected = useMemo(() => sections.find(section => section.id === selectedId) || null, [sections, selectedId])
  const selectedIndex = useMemo(() => sections.findIndex(section => section.id === selectedId), [sections, selectedId])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/products', { cache:'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/collections', { cache:'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([productData, collectionData]) => {
      if (!active) return
      setProducts(rowsOf(productData))
      setCollections(rowsOf(collectionData))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const snapshot = (): Snapshot => ({ theme:clone(theme), template, sections:clone(sections), navigation:clone(navigation), selectedId })
  const apply = (next: Snapshot, record = true) => {
    if (record) setHistory(items => [...items, snapshot()].slice(-50))
    setFuture([])
    setTheme(next.theme)
    setTemplate(next.template)
    setSections(next.sections)
    setNavigation(next.navigation)
    setSelectedId(next.selectedId && next.sections.some(s => s.id===next.selectedId) ? next.selectedId : (next.sections[0]?.id || ''))
    setDirty(true)
  }
  const mutate = (fn:(current:Snapshot)=>Snapshot) => apply(fn(snapshot()))

  const switchTemplate = (nextTemplate:string) => {
    if (nextTemplate === template) return
    const templates = clone(theme.editorTemplates || {})
    templates[template] = clone(sections)
    const target = clone(templates[nextTemplate] || fallbackTemplate(nextTemplate, initial.sections || []))
    setTheme({ ...theme, editorTemplates:templates, editorTemplateKey:nextTemplate })
    setTemplate(nextTemplate)
    setSections(target)
    setSelectedId(target[0]?.id || '')
    setHistory([])
    setFuture([])
    setDrawerOpen(Boolean(target[0]))
    setSettingsOpen(false)
    setPickerOpen(false)
    setQuery('')
    setDirty(true)
    setNotice(`Editing ${nextTemplate}`)
    setError('')
  }

  const updateSelected = (patch:Record<string,any>) => {
    if (!selected) return
    mutate(current => ({ ...current, sections:current.sections.map(section => section.id===selected.id ? { ...section, settings:{...(section.settings||{}),...patch} } : section) }))
  }
  const updateBlocks = (blocks:any[]) => {
    if (!selected) return
    mutate(current => ({ ...current, sections:current.sections.map(section => section.id===selected.id ? { ...section, blocks:clone(blocks) } : section) }))
  }
  const addSection = (type:string) => {
    const settings = type==='hero'
      ? { eyebrow:'NEW COLLECTION', heading:'Make your store impossible to ignore.', text:'A premium storefront built for conversion.', buttonLabel:'Shop now', buttonUrl:'/shop', imageUrl:'', desktopImageUrl:'', mobileImageUrl:'', minHeight:560, contentWidth:620, overlay:.24 }
      : type==='product_grid' ? { heading:'Featured products', subheading:'', limit:8, columns:4, collection:'', style:'cards', showViewAll:true }
      : { heading:labelFor(type), subheading:'', limit:type.includes('product')?8:4, columns:4, spacing:72 }
    const next:Section={ id:`${type}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type, enabled:true, settings, blocks:[] }
    mutate(current=>{const list=[...current.sections];const at=selectedIndex>=0?selectedIndex+1:list.length;list.splice(at,0,next);return {...current,sections:list,selectedId:next.id}})
    setSelectedId(next.id)
    setDrawerOpen(true)
    setPickerOpen(false)
    setQuery('')
  }
  const removeSection=()=>{
    if(!selected) return
    const remaining=sections.filter(section=>section.id!==selected.id)
    const nextId=remaining[Math.max(0,selectedIndex-1)]?.id||remaining[0]?.id||''
    mutate(current=>({...current,sections:remaining,selectedId:nextId}))
    setSelectedId(nextId)
    setDrawerOpen(Boolean(remaining.length))
  }
  const duplicateSection=()=>{
    if(!selected)return
    const copy=clone(selected)
    copy.id=`${selected.type}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    mutate(current=>{const list=[...current.sections];list.splice(selectedIndex+1,0,copy);return {...current,sections:list,selectedId:copy.id}})
    setSelectedId(copy.id)
  }
  const moveSelected=(delta:number)=>{
    if(selectedIndex<0)return
    mutate(current=>{const list=[...current.sections];const nextIndex=selectedIndex+delta;if(nextIndex<0||nextIndex>=list.length)return current;[list[selectedIndex],list[nextIndex]]=[list[nextIndex],list[selectedIndex]];return {...current}})
  }
  const toggleSection=(id:string)=>mutate(current=>({...current,sections:current.sections.map(section=>section.id===id?{...section,enabled:section.enabled===false}:section)}))
  const dropSection=(targetId:string)=>{
    if(!dragId||dragId===targetId)return
    const from=sections.findIndex(s=>s.id===dragId),to=sections.findIndex(s=>s.id===targetId)
    if(from<0||to<0)return
    mutate(current=>{const list=[...current.sections];const [item]=list.splice(from,1);list.splice(to,0,item);return {...current,sections:list}})
    setDragId(null)
  }
  const updateTheme=(patch:Record<string,any>)=>mutate(current=>({...current,theme:{...current.theme,...patch}}))
  const updateThemeNested=(root:string,patch:Record<string,any>)=>mutate(current=>({...current,theme:{...current.theme,[root]:{...(current.theme[root]||{}),...patch}}}))

  const save=async()=>{
    setSaving(true);setNotice('');setError('')
    const editorTemplates={...(theme.editorTemplates||{}),[template]:clone(sections)}
    const nextTheme={...theme,editorTemplates,editorTemplateKey:template}
    const homeSections=clone(editorTemplates['Home page']||initial.sections||[])
    try{
      const response=await fetch('/api/admin/theme',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({theme:nextTheme,sections:homeSections,editorTemplates,templateKey:template,navigation})})
      const data=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(data.error||'Unable to save theme')
      setTheme(data.theme||nextTheme)
      setNavigation(Array.isArray(data.navigation)?data.navigation:navigation)
      setDirty(false)
      setNotice(`${template} saved`)
      try{const channel=new BroadcastChannel('store-theme');channel.postMessage({theme:data.theme||nextTheme,sections:data.sections||homeSections});channel.close()}catch{}
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save theme')}finally{setSaving(false)}
  }
  const undo=()=>{if(!history.length)return;const previous=history[history.length-1];setFuture(items=>[...items,snapshot()]);setHistory(items=>items.slice(0,-1));apply(previous,false)}
  const redo=()=>{if(!future.length)return;const next=future[future.length-1];setHistory(items=>[...items,snapshot()]);setFuture(items=>items.slice(0,-1));apply(next,false)}

  const visibleSections=sections.filter(section=>section.enabled!==false&&!['announcement','header','footer'].includes(section.type))
  const pickerGroups=useMemo(()=>{const q=query.trim().toLowerCase();return ['Hero & media','Products','Collections','Content'].map(category=>({category,items:PICKER.filter(key=>META[key].category===category&&(!q||META[key].label.toLowerCase().includes(q)))})).filter(group=>group.items.length)},[query])
  const announcement=sections.find(section=>section.type==='announcement')?.settings?.text||theme.announcement?.text||'Free shipping on orders over $50'
  const brand=theme.brandName||'YOUR BRAND'

  return <div className={styles.editor}>
    <header className={styles.topbar}>
      <div className={styles.topLeft}>
        <a className={styles.iconButton} href="/admin/online-store"><ArrowLeft size={17}/></a>
        <div className={styles.titleBlock}><div className={styles.eyebrow}>ONLINE STORE</div><h1>{brand} · Theme editor</h1></div>
        <select className={styles.templateSelect} value={template} onChange={event=>switchTemplate(event.target.value)} aria-label="Template"><option value="Home page">Home page</option>{TEMPLATES.filter(t=>t!=='Home page').map(t=><option value={t} key={t}>{t}</option>)}</select>
      </div>
      <div className={styles.topActions}>
        {dirty&&<span className={styles.unsaved}><i/>Unsaved changes</span>}
        <button className={styles.iconButton} disabled={!history.length} onClick={undo} title="Undo"><Undo2 size={16}/></button>
        <button className={styles.iconButton} disabled={!future.length} onClick={redo} title="Redo"><Redo2 size={16}/></button>
        <div className={styles.deviceSwitch}>{(['desktop','tablet','mobile'] as const).map(item=><button key={item} className={device===item?styles.active:''} onClick={()=>setDevice(item)} title={item}>{item==='desktop'?<Monitor size={15}/>:item==='tablet'?<Tablet size={15}/>:<Smartphone size={15}/>}</button>)}</div>
        <button className={styles.secondaryButton} onClick={()=>window.open('/','_blank','noopener,noreferrer')}><Eye size={15}/>View live</button>
        <button className={styles.settingsButton} onClick={()=>{setSettingsOpen(value=>!value);setDrawerOpen(false)}}><Settings2 size={15}/></button>
        <button className={styles.primaryButton} disabled={!dirty||saving} onClick={save}><Save size={15}/>{saving?'Saving…':'Save'}</button>
      </div>
    </header>

    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}><div><div className={styles.eyebrow}>{template}</div><h2>Sections</h2><p>{sections.filter(section=>section.enabled!==false).length} visible · {sections.length} total</p></div><button className={styles.iconButton} onClick={()=>setPickerOpen(true)} title="Add section"><Plus size={17}/></button></div>
        <div className={styles.sectionList}>{sections.map((section,index)=><div key={section.id} draggable onDragStart={()=>setDragId(section.id)} onDragOver={event=>event.preventDefault()} onDrop={()=>dropSection(section.id)} className={`${styles.sectionRow} ${selectedId===section.id?styles.selected:''} ${section.enabled===false?styles.disabled:''}`}><button className={styles.dragHandle} title="Drag to reorder"><GripVertical size={15}/></button><button className={styles.sectionMain} onClick={()=>{setSelectedId(section.id);setDrawerOpen(true);setSettingsOpen(false)}}><span>{labelFor(section.type)}</span>{index===0&&<em>MAIN</em>}</button><button className={styles.visibilityButton} onClick={()=>toggleSection(section.id)} aria-label={section.enabled===false?'Enable section':'Disable section'}>{section.enabled===false?'○':'●'}</button></div>)}</div>
        <button className={styles.addSection} onClick={()=>setPickerOpen(true)}><Plus size={15}/>Add section</button>
        <div className={styles.sidebarLinks}><a href="/admin/online-store/navigation"><Settings2 size={14}/>Navigation</a><a href="/admin/media"><ImageIcon size={14}/>Media library</a></div>
      </aside>

      <main className={`${styles.preview} ${styles[device]}`}>
        <div className={styles.previewBar}><div><span>LIVE PREVIEW</span><strong>{template}</strong></div><span className={styles.live}><i/>{dirty?'Previewing unsaved draft':'Saved storefront'}</span></div>
        <div className={styles.canvas}><div className={styles.store}><div className={styles.announcement}>{announcement}</div><StorefrontSections sections={visibleSections} theme={theme} products={products} collections={collections} preview selectedId={selectedId} onSelect={id=>{setSelectedId(id);setDrawerOpen(true);setSettingsOpen(false)}} /></div></div>
      </main>

      {(drawerOpen&&selected)||settingsOpen ? <aside className={styles.drawer}>
        {settingsOpen ? <div className={styles.settingsPanel}><div className={styles.drawerHead}><div><span>STORE</span><h2>Theme settings</h2></div><button onClick={()=>setSettingsOpen(false)}><X size={15}/></button></div><div className={styles.drawerBody}><details className={styles.panel} open><summary>Brand</summary><div className={styles.panelBody}><label className={styles.field}><span>Brand name</span><input value={theme.brandName||''} onChange={event=>updateTheme({brandName:event.target.value})}/></label><label className={styles.field}><span>Logo URL</span><input value={theme.logoUrl||''} onChange={event=>updateTheme({logoUrl:event.target.value})}/></label></div></details><details className={styles.panel} open><summary>Colors</summary><div className={styles.panelBody}>{['background','surface','text','muted','primary','secondary','buttonText','border','sale','success','warning'].map(key=><label className={styles.field} key={key}><span>{key}</span><input value={theme.colors?.[key]||''} onChange={event=>updateThemeNested('colors',{[key]:event.target.value})}/></label>)}</div></details><details className={styles.panel}><summary>Typography & layout</summary><div className={styles.panelBody}><label className={styles.field}><span>Heading font</span><input value={theme.typography?.heading||''} onChange={event=>updateThemeNested('typography',{heading:event.target.value})}/></label><label className={styles.field}><span>Body font</span><input value={theme.typography?.body||''} onChange={event=>updateThemeNested('typography',{body:event.target.value})}/></label><label className={styles.field}><span>Max width</span><input type="number" value={theme.layout?.maxWidth||1360} onChange={event=>updateThemeNested('layout',{maxWidth:Number(event.target.value)})}/></label><label className={styles.field}><span>Section spacing</span><input type="number" value={theme.layout?.sectionSpacing||84} onChange={event=>updateThemeNested('layout',{sectionSpacing:Number(event.target.value)})}/></label></div></details></div></div> : <><div className={styles.drawerHead}><div><span>SECTION</span><h2>{selected?labelFor(selected.type):'Section'}</h2><small>{selected?.type}</small></div><div className={styles.drawerActions}><button onClick={()=>moveSelected(-1)} disabled={selectedIndex<=0} title="Move up">↑</button><button onClick={()=>moveSelected(1)} disabled={selectedIndex<0||selectedIndex>=sections.length-1} title="Move down">↓</button><button onClick={duplicateSection} title="Duplicate"><Copy size={14}/></button><button onClick={removeSection} className={styles.danger} title="Delete"><Trash2 size={14}/></button><button onClick={()=>setDrawerOpen(false)} title="Close"><X size={15}/></button></div></div>{selected&&<ShopifyThemeInspector section={selected} products={products} collections={collections} onUpdate={updateSelected} onUpdateBlocks={updateBlocks}/>}</>}
      </aside> : null}
    </div>

    {pickerOpen&&<div className={styles.modalBackdrop} onMouseDown={()=>setPickerOpen(false)}><div className={styles.picker} onMouseDown={event=>event.stopPropagation()}><div className={styles.pickerHead}><div><span>ADD SECTION</span><h2>Build {template}</h2></div><button className={styles.iconButton} onClick={()=>setPickerOpen(false)}><X size={16}/></button></div><div className={styles.search}><Search size={15}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search sections"/></div><div className={styles.pickerScroll}>{pickerGroups.map(group=><div className={styles.pickerGroup} key={group.category}><span>{group.category}</span>{group.items.map(key=><button key={key} onClick={()=>addSection(key)}><div><strong>{META[key].label}</strong><small>{META[key].description}</small></div><Plus size={15}/></button>)}</div>)}{!pickerGroups.length&&<div className={styles.emptyPicker}>No sections match your search.</div>}</div></div></div>}

    {notice&&<div className={styles.toast}>{notice}</div>}
    {error&&<div className={`${styles.toast} ${styles.error}`}>{error}</div>}
  </div>
}
