'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Link2, Plus, Save, Settings2, Trash2, X } from 'lucide-react'

type Item = { id:string; label:string; url?:string|null; type?:string; parentId?:string|null; resourceId?:string|null }
type Props = { initial:Item[]; categories:any[]; collections:any[] }
type DropMode = 'before'|'after'|'child'

const newId=()=>`nav-${Date.now()}-${Math.random().toString(36).slice(2,8)}`

function childrenOf(items:Item[], parentId:string|null){return items.filter(x=>(x.parentId??null)===parentId)}
function flatten(items:Item[]){const out:{item:Item;depth:number}[]=[];const walk=(parentId:string|null,depth:number)=>{for(const item of childrenOf(items,parentId)){out.push({item,depth});walk(item.id,depth+1)}};walk(null,0);return out}
function descendants(items:Item[],id:string){const set=new Set<string>();const visit=(parent:string)=>{for(const item of items){if((item.parentId??null)===parent&&!set.has(item.id)){set.add(item.id);visit(item.id)}}};visit(id);return set}
function normalize(items:Item[]){const valid=new Set(items.map(x=>x.id));return items.map(x=>({...x,parentId:x.parentId&&valid.has(x.parentId)?x.parentId:null}))}

export default function NavigationEditorPro({initial,categories,collections}:Props){
 const [items,setItems]=useState<Item[]>(()=>normalize(initial||[])),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[dragId,setDragId]=useState<string|null>(null),[overId,setOverId]=useState<string|null>(null),[editing,setEditing]=useState<Item|null>(null),[previewOpen,setPreviewOpen]=useState(true)
 const rows=useMemo(()=>flatten(items),[items]),roots=useMemo(()=>childrenOf(items,null),[items])
 const patch=(id:string,p:Partial<Item>)=>setItems(cur=>cur.map(x=>x.id===id?{...x,...p}:x))
 const remove=(id:string)=>{const ids=new Set([id,...descendants(items,id)]);setItems(cur=>cur.filter(x=>!ids.has(x.id)));if(editing?.id===id)setEditing(null)}
 const addItem=(type:Item['type']='custom')=>{const item:Item={id:newId(),label:type==='collection'?'New collection':type==='category'?'New category':'New link',type,url:type==='collection'?'/collections':type==='category'?'/shop':'#',parentId:null};setItems(cur=>[...cur,item]);setEditing(item)}
 const reorder=(sourceId:string,targetId:string,mode:DropMode)=>{
   if(sourceId===targetId)return
   setItems(cur=>{
     const source=cur.find(x=>x.id===sourceId),target=cur.find(x=>x.id===targetId);if(!source||!target)return cur
     if(descendants(cur,sourceId).has(targetId))return cur
     const without=cur.filter(x=>x.id!==sourceId)
     const parentId=mode==='child'?target.id:(target.parentId??null)
     const moved={...source,parentId}
     const siblingIds=without.filter(x=>(x.parentId??null)===parentId).map(x=>x.id)
     let index=siblingIds.indexOf(target.id)
     if(mode==='child')return [...without,moved]
     if(index<0)return [...without,moved]
     if(mode==='after')index+=1
     const orderedIds=[...siblingIds.slice(0,index),sourceId,...siblingIds.slice(index)]
     const byId=new Map(without.map(x=>[x.id,x]))
     const result:Item[]=[]
     const used=new Set<string>()
     for(const id of orderedIds){if(id===sourceId){result.push(moved);used.add(id)}else{const item=byId.get(id);if(item){result.push(item);used.add(id)}}}
     for(const item of without){if(!used.has(item.id))result.push(item)}
     return result
   })
   setDragId(null);setOverId(null)
 }
 const moveLevel=(id:string,dir:'indent'|'outdent')=>{const flat=flatten(items);const i=flat.findIndex(x=>x.item.id===id);if(i<0)return;const current=flat[i];if(dir==='indent'){const previous=flat[i-1]?.item;if(!previous)return;patch(id,{parentId:previous.id});return}if(current.item.parentId){const parent=items.find(x=>x.id===current.item.parentId);patch(id,{parentId:parent?.parentId??null})}}
 const save=async()=>{setSaving(true);setNotice('');setError('');try{const theme=await (await fetch('/api/admin/theme',{cache:'no-store'})).json();if(theme?.error)throw new Error(theme.error);const response=await fetch('/api/admin/theme',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...theme,navigation:items})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to save navigation');setNotice('Main menu saved')}catch(e){setError(e instanceof Error?e.message:'Unable to save navigation')}finally{setSaving(false)}}
 return <div className="navProPage">
  <div className="navProHeader"><div><div className="navEyebrow">ONLINE STORE</div><h1 className="h2">Navigation</h1><p className="muted">Create and organize menus just like Shopify. Drag items to reorder or nest them into dropdowns.</p></div><div className="inline"><button className="btn secondary" onClick={()=>setPreviewOpen(v=>!v)}>{previewOpen?'Hide preview':'Show preview'}</button><button className="btn" onClick={save} disabled={saving}><Save size={15}/>{saving?'Saving…':'Save'}</button></div></div>
  {(notice||error)&&<div className={error?'alert danger':'alert'}>{error||notice}</div>}
  <div className={`navShopifyLayout ${previewOpen?'withPreview':''}`}>
   <section className="navShopifyBuilder card"><div className="navMenuHeader"><div><div className="navMenuTitle"><strong>Main menu</strong><span className="navSavedDot">Unsaved changes</span></div><p className="muted">Your primary storefront navigation</p></div><button className="iconBtn" title="Menu settings"><Settings2 size={16}/></button></div>
    <div className="navToolbar"><button className="btn secondary" onClick={()=>addItem('custom')}><Plus size={15}/> Add menu item</button><div className="navToolbarHint">{roots.length} top-level items · drag the grip to reorder</div></div>
    <div className="navItemsList">
     {!rows.length&&<div className="navEmpty"><Link2 size={25}/><strong>Your menu is empty</strong><span className="muted">Add a menu item to start building your storefront navigation.</span><button className="btn" onClick={()=>addItem('custom')}><Plus size={15}/> Add menu item</button></div>}
     {rows.map(({item,depth})=>{const hasChildren=childrenOf(items,item.id).length>0;const active=overId===item.id;return <div key={item.id} className={`navItemWrap depth-${Math.min(depth,3)}`}>
       <div className={`navShopifyItem ${active?'dropTarget':''}`} style={{marginLeft:depth*24}} draggable onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.id);setDragId(item.id)}} onDragEnd={()=>{setDragId(null);setOverId(null)}} onDragOver={e=>{e.preventDefault();if(dragId&&dragId!==item.id&&!descendants(items,dragId).has(item.id))setOverId(item.id)}} onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData('text/plain')||dragId;if(source&&source!==item.id)reorder(source,item.id,'after')}}>
        <GripVertical className="navGrip" size={18}/><div className="navItemMain"><strong>{item.label}</strong><span>{item.url||'No link assigned'}</span></div>{hasChildren&&<span className="navChildBadge"><ChevronDown size={13}/>Dropdown</span>}
        <button className="navItemAction" onClick={()=>setEditing(item)}><Settings2 size={15}/></button><button className="navItemAction danger" onClick={()=>remove(item.id)}><Trash2 size={15}/></button>
       </div>
       {active&&dragId&&<div className="navDropActions"><button onClick={()=>reorder(dragId,item.id,'before')}>Place above</button><button onClick={()=>reorder(dragId,item.id,'child')}>Make submenu</button><button onClick={()=>reorder(dragId,item.id,'after')}>Place below</button></div>}
       {hasChildren&&<div className="navChildRail" style={{marginLeft:(depth+1)*24}}><ChevronRight size={14}/>{childrenOf(items,item.id).map(child=><span key={child.id}>{child.label}</span>)}</div>}
      </div>})}
    </div>
    <div className="navHelp"><strong>How menus work</strong><span>Drag the grip and drop onto another item. Use the drop controls to place it above, below, or inside the target as a dropdown.</span></div>
   </section>
   {previewOpen&&<aside className="navPreviewPane card"><div className="navPreviewHeader"><div><strong>Storefront preview</strong><span className="muted">Your header navigation</span></div><span className="previewBadge">Desktop</span></div><div className="navPreviewBrowser"><div className="browserDots"><i/><i/><i/></div><div className="previewHeaderBar"><strong>YOUR BRAND</strong><div className="previewLinks">{roots.map(item=><span key={item.id}>{item.label}{childrenOf(items,item.id).length>0&&<ChevronDown size={12}/>}</span>)}</div><div className="previewIcons">♡　⌕　Bag</div></div><div className="previewHero"><span>Storefront preview</span><strong>Build your navigation</strong><small>Dropdowns and nested links are reflected here.</small></div></div></aside>}
  </div>
  {editing&&<div className="navModalOverlay" onMouseDown={()=>setEditing(null)}><div className="navEditPanel" onMouseDown={e=>e.stopPropagation()}><div className="navEditHeader"><div><div className="navEyebrow">MENU ITEM</div><h2>{editing.label||'Menu item'}</h2></div><button className="iconBtn" onClick={()=>setEditing(null)}><X size={17}/></button></div>
    <label className="fieldLabel">Name<input className="input" value={editing.label} onChange={e=>{setEditing({...editing,label:e.target.value});patch(editing.id,{label:e.target.value})}}/></label>
    <label className="fieldLabel">Link type<select className="input" value={editing.type||'custom'} onChange={e=>{const type=e.target.value;setEditing({...editing,type});patch(editing.id,{type})}}><option value="custom">Custom link</option><option value="collection">Collection</option><option value="category">Category</option></select></label>
    {editing.type==='collection'&&<label className="fieldLabel">Collection<select className="input" value={editing.resourceId||''} onChange={e=>{const resourceId=e.target.value;const c=collections.find(x=>x.id===resourceId);const next={...editing,resourceId,label:c?.name||editing.label,url:c?`/collections/${c.slug}`:'/collections'};setEditing(next);patch(editing.id,{resourceId,label:next.label,url:next.url})}}><option value="">Choose a collection</option>{collections.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    {editing.type==='category'&&<label className="fieldLabel">Category<select className="input" value={editing.resourceId||''} onChange={e=>{const resourceId=e.target.value;const c=categories.find(x=>x.id===resourceId);const next={...editing,resourceId,label:c?.name||editing.label,url:c?`/shop?category=${c.slug}`:'/shop'};setEditing(next);patch(editing.id,{resourceId,label:next.label,url:next.url})}}><option value="">Choose a category</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    {(!editing.type||editing.type==='custom')&&<label className="fieldLabel">URL<input className="input" value={editing.url||''} onChange={e=>{setEditing({...editing,url:e.target.value});patch(editing.id,{url:e.target.value})}} placeholder="/collections/all"/></label>}
    <div className="navEditTip"><strong>Dropdown:</strong> Drag this item over another item, then choose “Make submenu”.</div><div className="navEditFooter"><button className="btn secondary" onClick={()=>setEditing(null)}>Done</button><button className="btn dangerBtn" onClick={()=>{remove(editing.id);setEditing(null)}}>Remove item</button></div>
   </div></div>}
 </div>
}
