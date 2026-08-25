'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Eye, GripVertical, Image as ImageIcon, Plus, Save, Search, Trash2, X } from 'lucide-react'

type Product = { id:string; name:string; slug:string; sku?:string|null; status:string; basePrice:number; images?:{url:string}[]; category?:{name:string}|null }
type Collection = { id:string; name:string; slug:string; description?:string|null; imageUrl?:string|null; isActive:boolean; products:{ product:Product }[] }

async function api(path:string, init?:RequestInit){
  const r=await fetch(path,{...init,headers:{'content-type':'application/json',...(init?.headers||{})}})
  const data=await r.json().catch(()=>({}))
  if(!r.ok) throw new Error(data.error||'Request failed')
  return data
}

export default function CollectionEditorShopify({ id }:{ id:string }){
  const [collection,setCollection]=useState<Collection|null>(null)
  const [products,setProducts]=useState<Product[]>([])
  const [q,setQ]=useState('')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [dirty,setDirty]=useState(false)
  const [pickerOpen,setPickerOpen]=useState(false)
  const [selected,setSelected]=useState<string[]>([])

  useEffect(()=>{
    Promise.all([api(`/api/admin/collections/${id}`),api('/api/admin/products?page=1&pageSize=50&sort=name_asc')])
      .then(([c,p])=>{setCollection(c.collection);setProducts(p.rows||[]);setLoading(false)})
      .catch(e=>{setError(e instanceof Error?e.message:'Unable to load collection');setLoading(false)})
  },[id])

  useEffect(()=>{
    if(collection) setSelected(collection.products.map(x=>x.product.id))
  },[collection?.id])

  const filteredProducts=useMemo(()=>products.filter(p=>!q||`${p.name} ${p.sku||''}`.toLowerCase().includes(q.toLowerCase())),[products,q])
  const assigned=collection?.products.map(x=>x.product) || []

  function setField(p:Partial<Collection>){setCollection(c=>c?{...c,...p}:c);setDirty(true);setNotice('')}
  function toggleProduct(product:Product){
    setSelected(current=>current.includes(product.id)?current.filter(id=>id!==product.id):[...current,product.id])
    setDirty(true);setNotice('')
  }
  function removeAssigned(id:string){setSelected(current=>current.filter(x=>x!==id));setDirty(true);setNotice('')}

  async function save(){
    if(!collection) return
    setSaving(true);setError('');setNotice('')
    try{
      const data=await api(`/api/admin/collections/${id}`,{method:'PATCH',body:JSON.stringify({name:collection.name,slug:collection.slug,description:collection.description||null,imageUrl:collection.imageUrl||null,isActive:collection.isActive,productIds:selected})})
      const fresh=await api(`/api/admin/collections/${id}`)
      setCollection(fresh.collection);setSelected(fresh.collection.products.map((x:any)=>x.product.id));setDirty(false);setNotice('Collection saved')
    }catch(e){setError(e instanceof Error?e.message:'Unable to save collection')}
    finally{setSaving(false)}
  }

  if(loading) return <div className="collectionEditorLoading">Loading collection…</div>
  if(!collection) return <div className="empty">{error||'Collection not found.'}</div>

  return <div className="collectionEditorShopify">
    <div className="collectionEditorTopbar">
      <div className="collectionEditorTitle">
        <Link href="/admin/collections" className="iconBtn"><ArrowLeft size={18}/></Link>
        <div><div className="muted tiny">COLLECTION</div><h1>{collection.name||'Untitled collection'}</h1>{dirty&&<span className="muted tiny">Unsaved changes</span>}</div>
      </div>
      <div className="inline"><Link className="btn secondary" href={`/collections/${collection.slug}`} target="_blank"><Eye size={16}/> Preview</Link><button className="btn" disabled={saving||!dirty} onClick={save}>{saving?'Saving…':<><Save size={16}/> Save</>}</button></div>
    </div>

    {(error||notice)&&<div className={error?'alert danger':'alert'}>{error||notice}</div>}

    <div className="collectionEditorGrid">
      <main className="collectionEditorMain">
        <section className="card collectionCard"><div className="collectionCardHead"><div><h2>Collection details</h2><p>Control how this collection is named and presented in your store.</p></div></div><div className="collectionFields"><label>Name<input className="input" value={collection.name} onChange={e=>setField({name:e.target.value})}/></label><label>Handle<input className="input" value={collection.slug} onChange={e=>setField({slug:e.target.value})}/></label><label>Description<textarea className="textarea" rows={7} value={collection.description||''} onChange={e=>setField({description:e.target.value})}/></label><label>Collection image<div className="collectionImageField"><div className="collectionImagePreview">{collection.imageUrl?<img src={collection.imageUrl} alt=""/>:<ImageIcon size={24}/>}</div><input className="input" placeholder="https://…" value={collection.imageUrl||''} onChange={e=>setField({imageUrl:e.target.value})}/></div></label></div></section>

        <section className="card collectionCard"><div className="collectionCardHead"><div><h2>Products</h2><p>{selected.length} product{selected.length===1?'':'s'} in this collection</p></div><button className="btn" onClick={()=>setPickerOpen(true)}><Plus size={16}/> Add products</button></div>{assigned.length?<div className="assignedList">{assigned.filter(p=>selected.includes(p.id)).map((p,i)=><div className="assignedRow" key={p.id}><GripVertical size={16}/><div className="assignedThumb">{p.images?.[0]?.url?<img src={p.images[0].url} alt=""/>:<span>◎</span>}</div><div className="assignedInfo"><Link href={`/admin/products/${p.id}`}><strong>{p.name}</strong></Link><span>{p.sku||'No SKU'}{p.category?.name?` · ${p.category.name}`:''}</span></div><div className="assignedPrice">{(Number(p.basePrice||0)/100).toFixed(2)}</div><button className="iconBtn" title="Remove" onClick={()=>removeAssigned(p.id)}><Trash2 size={16}/></button></div>)}</div>:<div className="emptyInline">No products yet. Add products to build this collection.</div>}</section>
      </main>

      <aside className="collectionEditorSide">
        <section className="card collectionCard"><div className="collectionCardHead"><div><h2>Status</h2><p>Control storefront visibility.</p></div></div><button className={collection.isActive?'collectionStatus active':'collectionStatus'} onClick={()=>setField({isActive:!collection.isActive})}><span className="statusDot"/><span><strong>{collection.isActive?'Active':'Inactive'}</strong><small>{collection.isActive?'Visible in the Online Store':'Hidden from the Online Store'}</small></span></button></section>
        <section className="card collectionCard"><h2>Storefront</h2><div className="collectionMetaRow"><span>URL</span><code>/collections/{collection.slug}</code></div><div className="collectionMetaRow"><span>Products</span><strong>{selected.length}</strong></div></section>
      </aside>
    </div>

    {pickerOpen&&<div className="modalOverlay" onClick={()=>setPickerOpen(false)}><div className="card collectionPicker" onClick={e=>e.stopPropagation()}><div className="collectionPickerHead"><div><h2>Add products</h2><p>Select products to include in this collection.</p></div><button className="iconBtn" onClick={()=>setPickerOpen(false)}><X size={17}/></button></div><div className="collectionPickerSearch"><Search size={16}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products…"/></div><div className="collectionPickerList">{filteredProducts.map(p=>{const checked=selected.includes(p.id);return <button key={p.id} className={checked?'pickerProduct selected':'pickerProduct'} onClick={()=>toggleProduct(p)}><span className="pickerCheck">{checked?<Check size={15}/>:null}</span><span className="pickerThumb">{p.images?.[0]?.url?<img src={p.images[0].url} alt=""/>:<span>◎</span>}</span><span className="pickerInfo"><strong>{p.name}</strong><small>{p.sku||'No SKU'} · {p.status}</small></span></button>})}{!filteredProducts.length&&<div className="empty">No products found.</div>}</div><div className="collectionPickerFoot"><span className="muted">{selected.length} selected</span><div className="inline"><button className="btn secondary" onClick={()=>setPickerOpen(false)}>Cancel</button><button className="btn" onClick={()=>setPickerOpen(false)}>Done</button></div></div></div></div>}
  </div>
}
