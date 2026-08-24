'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Link2, Plus, Save, Settings2, Trash2, X } from 'lucide-react'

type Item = { id: string; label: string; url?: string | null; type?: string; parentId?: string | null; resourceId?: string | null }
type Props = { initial: Item[]; categories: any[]; collections: any[] }
type Draft = { label: string; type: 'custom' | 'collection' | 'category'; url: string; resourceId: string; parentId: string | null }

const newId = () => `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const childrenOf = (items: Item[], parentId: string | null) => items.filter(x => (x.parentId ?? null) === parentId)
const descendants = (items: Item[], id: string) => {
  const out = new Set<string>()
  const walk = (parent: string) => {
    items.filter(x => x.parentId === parent).forEach(x => { if (!out.has(x.id)) { out.add(x.id); walk(x.id) } })
  }
  walk(id)
  return out
}
function normalize(items: Item[]) {
  const valid = new Set(items.map(x => x.id))
  return items.map(x => ({ ...x, parentId: x.parentId && valid.has(x.parentId) ? x.parentId : null }))
}

export default function NavigationEditorPro({ initial, categories, collections }: Props) {
  const [items, setItems] = useState<Item[]>(() => normalize(initial || []))
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(true)
  const [editor, setEditor] = useState<Item | null>(null)
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const roots = useMemo(() => childrenOf(items, null), [items])

  const patch = (id: string, patchData: Partial<Item>) => setItems(cur => cur.map(x => x.id === id ? { ...x, ...patchData } : x))
  const remove = (id: string) => {
    const ids = new Set([id, ...descendants(items, id)])
    setItems(cur => cur.filter(x => !ids.has(x.id)))
    if (editor?.id === id) setEditor(null)
  }

  const save = async () => {
    setSaving(true); setNotice(''); setError('')
    try {
      const theme = await (await fetch('/api/admin/theme', { cache: 'no-store' })).json()
      if (theme?.error) throw new Error(theme.error)
      const response = await fetch('/api/admin/theme', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...theme, navigation: items }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save navigation')
      setNotice('Navigation saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save navigation') }
    finally { setSaving(false) }
  }

  const createItem = (draft: Draft) => {
    const item: Item = {
      id: newId(), label: draft.label.trim() || (draft.parentId ? 'New submenu item' : 'New menu item'),
      type: draft.type, url: draft.url || '#', resourceId: draft.resourceId || null, parentId: draft.parentId,
    }
    setItems(cur => [...cur, item])
    setAdding(null)
    setEditor(item)
  }

  const moveItem = (id: string, parentId: string | null) => {
    if (parentId === id || descendants(items, id).has(parentId || '')) return
    patch(id, { parentId })
  }

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    if (descendants(items, dragId).has(targetId)) return
    moveItem(dragId, targetId)
    setDragId(null)
  }

  return (
    <div className="navShopifyPage">
      <style dangerouslySetInnerHTML={{ __html: `
        .navShopifyPage{max-width:1180px;margin:0 auto;padding:4px 0 40px}.navShopifyHead{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:20px}.navEyebrow{font-size:11px;letter-spacing:.08em;font-weight:800;color:#6b7280}.navShopifyHead h1{margin:4px 0;font-size:30px;letter-spacing:-.035em}.navShopifyHead p{margin:0;max-width:680px}.navShopifyGrid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px}.navCard{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}.navCardHead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px;border-bottom:1px solid #edf0f2}.navCardHead strong{font-size:15px}.navCardHead span{display:block;font-size:12px;color:#6b7280;margin-top:3px}.navToolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #edf0f2;background:#fbfbfb}.navToolbarHint{font-size:12px;color:#6b7280}.navTree{padding:12px}.navTreeItem{margin-bottom:8px}.navRow{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e5e7eb;border-radius:11px;background:#fff;transition:.14s}.navRow:hover{border-color:#cfd5db;box-shadow:0 1px 4px rgba(0,0,0,.04)}.navRow.dragOver{border-color:#008060;background:#f3fbf8}.navGrip{color:#9ca3af;cursor:grab;flex:0 0 auto}.navMain{min-width:0;flex:1;cursor:pointer}.navMain strong{display:block;font-size:14px}.navMain small{display:block;color:#6b7280;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.navActions{display:flex;gap:6px;align-items:center}.navAction{height:34px;min-width:34px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.navAction.primary{padding:0 10px;gap:6px;font-size:11px;font-weight:800}.navAction:hover{background:#f7f7f7}.navAction.danger{color:#b42318}.navChild{margin:6px 0 0 34px;padding-left:14px;border-left:2px solid #e5e7eb}.navChildRow{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid #eef0f2;border-radius:10px;background:#fbfcfc;margin-bottom:6px}.navChildLabel{flex:1;min-width:0}.navChildLabel strong{font-size:13px}.navChildLabel small{display:block;color:#6b7280;font-size:11px;margin-top:2px}.navSubAdd{margin:2px 0 8px 12px;border:0;background:transparent;color:#008060;font-size:11px;font-weight:800;cursor:pointer}.navEmpty{padding:48px 20px;text-align:center;display:grid;justify-items:center;gap:8px}.navPreview{padding:0;min-height:360px}.navPreviewHead{padding:16px 18px;border-bottom:1px solid #edf0f2}.navBrowser{margin:18px;border:1px solid #e2e5e7;border-radius:10px;overflow:hidden;background:#fff}.navBrowserTop{height:26px;background:#f4f5f5;border-bottom:1px solid #e6e8ea;display:flex;align-items:center;gap:5px;padding:0 10px}.navDot{width:7px;height:7px;border-radius:50%;background:#c7cbcf}.navStoreHeader{padding:16px;border-bottom:1px solid #edf0f2;display:flex;align-items:center;gap:20px}.navBrand{font-weight:900;font-size:13px}.navPreviewLinks{display:flex;align-items:center;gap:14px;flex:1;justify-content:center}.navPreviewLinks span{font-size:11px;font-weight:700;display:flex;align-items:center;gap:3px}.navMockHero{margin:16px;border-radius:10px;padding:28px;background:linear-gradient(135deg,#171717,#444);color:#fff;display:grid;gap:8px}.navMockHero small{opacity:.7}.navMockHero strong{font-size:24px}.navMockHero span{opacity:.75;font-size:11px}.navOverlay{position:fixed;inset:0;background:rgba(17,24,39,.28);z-index:1000;display:flex;justify-content:flex-end}.navDrawer{height:100%;width:min(460px,100%);background:#fff;box-shadow:-10px 0 30px rgba(0,0,0,.12);display:flex;flex-direction:column}.navDrawerHead{padding:18px;border-bottom:1px solid #edf0f2;display:flex;justify-content:space-between;gap:10px}.navDrawerBody{padding:18px;display:grid;gap:16px;overflow:auto}.navField{display:grid;gap:7px}.navField label{font-size:12px;font-weight:800}.navField input,.navField select{width:100%;height:42px;border:1px solid #dfe3e6;border-radius:9px;padding:0 12px;background:#fff}.navDestination{padding:13px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa}.navDestination strong{font-size:12px}.navHint{padding:12px;border-radius:9px;background:#f6f8f7;color:#4b5563;font-size:11px;line-height:1.5}.navDrawerFoot{margin-top:auto;padding:14px 18px;border-top:1px solid #edf0f2;display:flex;justify-content:space-between;gap:10px}.navParentBadge{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#eef7f4;color:#006b52;font-size:10px;font-weight:800}.navSaveDot{font-size:11px;color:#6b7280}.navAlert{margin-bottom:14px}.navMobileHint{display:none}@media(max-width:900px){.navShopifyGrid{grid-template-columns:1fr}.navPreview{display:none}}@media(max-width:640px){.navShopifyHead{align-items:stretch;flex-direction:column}.navShopifyHead .inline{display:grid;grid-template-columns:1fr 1fr}.navToolbar{align-items:flex-start;flex-direction:column}.navActions .hideSmall{display:none}.navMobileHint{display:block}.navChild{margin-left:18px}.navRow{padding:10px}.navMain small{max-width:160px}}
      ` }} />

      <div className="navShopifyHead">
        <div><div className="navEyebrow">ONLINE STORE · NAVIGATION</div><h1>Navigation</h1><p className="muted">Build your menus without fighting drag-and-drop. Add a menu item, choose where it belongs, and Shopify-style dropdowns are created automatically.</p></div>
        <div className="inline"><button className="btn secondary" onClick={() => setPreviewOpen(v => !v)}>{previewOpen ? 'Hide preview' : 'Show preview'}</button><button className="btn" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save'}</button></div>
      </div>
      {(notice || error) && <div className={`alert navAlert ${error ? 'danger' : ''}`}>{error || notice}</div>}

      <div className="navShopifyGrid">
        <section className="navCard">
          <div className="navCardHead"><div><strong>Main menu</strong><span>What customers see in your store header.</span></div><span className="navSaveDot">{saving ? 'Saving…' : 'Unsaved changes'}</span></div>
          <div className="navToolbar"><button className="btn secondary" onClick={() => setAdding({ parentId: null })}><Plus size={15}/> Add menu item</button><div className="navToolbarHint">{roots.length} top-level items</div></div>
          <div className="navTree">
            {roots.length === 0 && <div className="navEmpty"><Link2 size={26}/><strong>No menu items yet</strong><span className="muted">Start with your first menu item.</span><button className="btn" onClick={() => setAdding({ parentId: null })}><Plus size={15}/> Add menu item</button></div>}
            {roots.map(root => {
              const children = childrenOf(items, root.id)
              return <div className="navTreeItem" key={root.id}
                onDragOver={e => { e.preventDefault(); if (dragId && dragId !== root.id && !descendants(items, dragId).has(root.id)) e.currentTarget.classList.add('dragOver') }}
                onDragLeave={e => e.currentTarget.classList.remove('dragOver')}
                onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragOver'); const source = e.dataTransfer.getData('text/plain') || dragId; if (source) handleDrop(root.id) }}>
                <div className="navRow">
                  <span className="navGrip" draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', root.id); setDragId(root.id) }} onDragEnd={() => setDragId(null)}><GripVertical size={18}/></span>
                  <div className="navMain" onClick={() => setEditor(root)}><strong>{root.label}</strong><small>{root.url || 'No destination'}</small></div>
                  {children.length > 0 && <span className="navParentBadge"><ChevronDown size={12}/> {children.length} submenu</span>}
                  <div className="navActions"><button className="navAction primary" onClick={() => setAdding({ parentId: root.id })}><Plus size={13}/> Submenu</button><button className="navAction" onClick={() => setEditor(root)} title="Edit"><Settings2 size={14}/></button><button className="navAction danger" onClick={() => remove(root.id)} title="Delete"><Trash2 size={14}/></button></div>
                </div>
                {children.length > 0 && <div className="navChild">{children.map(child => <div className="navChildRow" key={child.id}><span className="navGrip" draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', child.id); setDragId(child.id) }} onDragEnd={() => setDragId(null)}><GripVertical size={16}/></span><div className="navChildLabel" onClick={() => setEditor(child)}><strong>{child.label}</strong><small>{child.url || 'No destination'}</small></div><button className="navAction" onClick={() => setAdding({ parentId: child.id })}><Plus size={13}/></button><button className="navAction" onClick={() => moveItem(child.id, null)} title="Move to main menu"><ChevronRight size={14}/></button><button className="navAction" onClick={() => setEditor(child)}><Settings2 size={14}/></button><button className="navAction danger" onClick={() => remove(child.id)}><Trash2 size={14}/></button></div>)}</div>}
                <button className="navSubAdd" onClick={() => setAdding({ parentId: root.id })}>+ Add submenu item</button>
              </div>
            })}
          </div>
          <div className="navToolbar"><div className="navToolbarHint">Tip: You can use the Submenu button instead of dragging anything.</div><button className="btn secondary" onClick={() => setAdding({ parentId: null })}><Plus size={15}/> Add another item</button></div>
        </section>

        {previewOpen && <aside className="navCard navPreview"><div className="navPreviewHeader navCardHead"><div><strong>Storefront preview</strong><span>Header + dropdown structure</span></div><span className="previewBadge">Desktop</span></div><div className="navBrowser"><div className="navBrowserTop"><i className="navDot"/><i className="navDot"/><i className="navDot"/></div><div className="navStoreHeader"><span className="navBrand">YOUR BRAND</span><div className="navPreviewLinks">{roots.map(root => <span key={root.id}>{root.label}{childrenOf(items,root.id).length > 0 && <ChevronDown size={11}/>}</span>)}</div><span className="muted" style={{fontSize:11}}>Bag</span></div><div className="navMockHero"><small>LIVE PREVIEW</small><strong>Navigation built the easy way.</strong><span>Dropdowns and submenu hierarchy follow your menu structure.</span></div></div></aside>}
      </div>

      {(adding || editor) && <div className="navOverlay" onMouseDown={() => { setAdding(null); setEditor(null) }}>
        {adding && <AddDrawer parentId={adding.parentId} items={items} categories={categories} collections={collections} onClose={() => setAdding(null)} onCreate={createItem} />}
        {editor && !adding && <EditDrawer item={editor} items={items} categories={categories} collections={collections} onClose={() => setEditor(null)} patch={patch} remove={remove} />}
      </div>}
    </div>
  )
}

function emptyDraft(parentId: string | null): Draft { return { label: '', type: 'custom', url: '', resourceId: '', parentId } }
function AddDrawer({ parentId, items, categories, collections, onClose, onCreate }: { parentId: string | null; items: Item[]; categories: any[]; collections: any[]; onClose: () => void; onCreate: (d: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(parentId))
  const parents = items.filter(x => x.id !== parentId)
  const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }))
  const chooseCollection = (id: string) => { const c = collections.find(x => x.id === id); set({ resourceId:id, label:c?.name || '', url:c ? `/collections/${c.slug}` : '' }) }
  const chooseCategory = (id: string) => { const c = categories.find(x => x.id === id); set({ resourceId:id, label:c?.name || '', url:c ? `/shop?category=${c.slug}` : '' }) }
  return <div className="navDrawer" onMouseDown={e => e.stopPropagation()}><div className="navDrawerHead"><div><div className="navEyebrow">ADD MENU ITEM</div><h2 style={{margin:'4px 0 0'}}>Create menu item</h2></div><button className="iconBtn" onClick={onClose}><X size={17}/></button></div><div className="navDrawerBody">
    <div className="navField"><label>Where should it appear?</label><select value={draft.parentId || ''} onChange={e => set({ parentId: e.target.value || null })}><option value="">Main menu</option>{parents.map(p => <option key={p.id} value={p.id}>Under “{p.label}”</option>)}</select></div>
    <div className="navDestination"><strong>{draft.parentId ? `Dropdown under “${items.find(x => x.id === draft.parentId)?.label || ''}”` : 'Top-level menu item'}</strong><div className="muted" style={{fontSize:11,marginTop:4}}>You can change the parent here without dragging.</div></div>
    <div className="navField"><label>Link type</label><select value={draft.type} onChange={e => set({ type: e.target.value as Draft['type'], resourceId:'', label:e.target.value==='custom'?'':draft.label, url:e.target.value==='custom'?draft.url:'' })}><option value="custom">Custom URL</option><option value="collection">Collection</option><option value="category">Category</option></select></div>
    {draft.type === 'collection' && <div className="navField"><label>Collection</label><select value={draft.resourceId} onChange={e => chooseCollection(e.target.value)}><option value="">Select collection</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    {draft.type === 'category' && <div className="navField"><label>Category</label><select value={draft.resourceId} onChange={e => chooseCategory(e.target.value)}><option value="">Select category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    <div className="navField"><label>Label</label><input value={draft.label} onChange={e => set({label:e.target.value})} placeholder="e.g. Men"/></div>
    {draft.type === 'custom' && <div className="navField"><label>URL</label><input value={draft.url} onChange={e => set({url:e.target.value})} placeholder="/collections/all"/></div>}
    <div className="navHint"><strong>Shopify-style workflow:</strong> choose the parent first, then choose the destination. No dragging is required to create dropdowns.</div>
  </div><div className="navDrawerFoot"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={() => onCreate(draft)} disabled={!draft.label.trim() || !draft.url}>Add item</button></div></div>
}

function EditDrawer({ item, items, categories, collections, onClose, patch, remove }: { item: Item; items: Item[]; categories:any[]; collections:any[]; onClose:()=>void; patch:(id:string,p:Partial<Item>)=>void; remove:(id:string)=>void }) {
  const [draft,setDraft]=useState(item)
  const set=(p:Partial<Item>)=>setDraft(d=>({...d,...p}))
  const chooseCollection=(id:string)=>{const c=collections.find(x=>x.id===id);const next={resourceId:id,label:c?.name||draft.label,url:c?`/collections/${c.slug}`:'/collections'};set(next);patch(item.id,next)}
  const chooseCategory=(id:string)=>{const c=categories.find(x=>x.id===id);const next={resourceId:id,label:c?.name||draft.label,url:c?`/shop?category=${c.slug}`:'/shop'};set(next);patch(item.id,next)}
  const parents=items.filter(x=>x.id!==item.id&&!(() => { const stack=[item.id]; const setIds=new Set([item.id]); while(stack.length){const p=stack.pop()!;items.filter(i=>i.parentId===p).forEach(i=>{if(!setIds.has(i.id)){setIds.add(i.id);stack.push(i.id)}})} return setIds.has(x.id) })())
  return <div className="navDrawer" onMouseDown={e=>e.stopPropagation()}><div className="navDrawerHead"><div><div className="navEyebrow">MENU ITEM</div><h2 style={{margin:'4px 0 0'}}>{item.label || 'Menu item'}</h2></div><button className="iconBtn" onClick={onClose}><X size={17}/></button></div><div className="navDrawerBody">
    <div className="navField"><label>Parent</label><select value={draft.parentId || ''} onChange={e=>{const parentId=e.target.value||null;set({parentId});patch(item.id,{parentId})}}><option value="">Main menu</option>{parents.map(p=><option key={p.id} value={p.id}>Under “{p.label}”</option>)}</select></div>
    <div className="navField"><label>Link type</label><select value={draft.type || 'custom'} onChange={e=>{const type=e.target.value;set({type});patch(item.id,{type})}}><option value="custom">Custom URL</option><option value="collection">Collection</option><option value="category">Category</option></select></div>
    {draft.type === 'collection' && <div className="navField"><label>Collection</label><select value={draft.resourceId || ''} onChange={e=>chooseCollection(e.target.value)}><option value="">Select collection</option>{collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    {draft.type === 'category' && <div className="navField"><label>Category</label><select value={draft.resourceId || ''} onChange={e=>chooseCategory(e.target.value)}><option value="">Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    <div className="navField"><label>Label</label><input value={draft.label} onChange={e=>{const label=e.target.value;set({label});patch(item.id,{label})}}/></div>
    {(!draft.type || draft.type === 'custom') && <div className="navField"><label>URL</label><input value={draft.url || ''} onChange={e=>{const url=e.target.value;set({url});patch(item.id,{url})}}/></div>}
  </div><div className="navDrawerFoot"><button className="btn secondary" onClick={onClose}>Done</button><button className="btn" style={{background:'#fff1f0',borderColor:'#ffd4cf',color:'#b42318'}} onClick={()=>{remove(item.id);onClose()}}>Remove item</button></div></div>
}
