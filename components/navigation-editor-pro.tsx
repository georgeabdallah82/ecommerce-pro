'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Link2, Plus, Save, Settings2, Trash2, X } from 'lucide-react'

type Item = {
  id: string
  label: string
  url?: string | null
  type?: string
  parentId?: string | null
  resourceId?: string | null
}

type Props = {
  initial: Item[]
  categories: any[]
  collections: any[]
}

const newId = () => `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function flatten(items: Item[]) {
  const byParent = new Map<string | null, Item[]>()
  for (const item of items) {
    const key = item.parentId ?? null
    byParent.set(key, [...(byParent.get(key) || []), item])
  }
  const output: { item: Item; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const item of byParent.get(parentId) || []) {
      output.push({ item, depth })
      walk(item.id, depth + 1)
    }
  }
  walk(null, 0)
  return output
}

export default function NavigationEditorPro({ initial, categories, collections }: Props) {
  const [items, setItems] = useState<Item[]>(initial || [])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [previewOpen, setPreviewOpen] = useState(true)

  const rows = useMemo(() => flatten(items), [items])
  const roots = useMemo(() => items.filter(item => !item.parentId), [items])

  const patch = (id: string, patchData: Partial<Item>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patchData } : item))
  }

  const remove = (id: string) => {
    const ids = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const item of items) {
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id)
          changed = true
        }
      }
    }
    setItems(current => current.filter(item => !ids.has(item.id)))
    if (editing?.id === id) setEditing(null)
  }

  const addItem = (type: Item['type'] = 'custom') => {
    const item: Item = {
      id: newId(),
      label: type === 'collection' ? 'New collection' : type === 'category' ? 'New category' : 'New link',
      type,
      url: type === 'collection' ? '/collections' : type === 'category' ? '/shop' : '#',
      parentId: null,
    }
    setItems(current => [...current, item])
    setEditing(item)
  }

  const save = async () => {
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const theme = await (await fetch('/api/admin/theme', { cache: 'no-store' })).json()
      if (theme?.error) throw new Error(theme.error)
      const response = await fetch('/api/admin/theme', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...theme, navigation: items }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save navigation')
      setNotice('Main menu saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save navigation')
    } finally {
      setSaving(false)
    }
  }

  const reorderAfterDrop = (sourceId: string, targetId: string, mode: 'before' | 'after' | 'child') => {
    if (sourceId === targetId) return
    setItems(current => {
      const source = current.find(item => item.id === sourceId)
      const target = current.find(item => item.id === targetId)
      if (!source || !target) return current
      if (target.parentId === source.id) return current

      const descendants = new Set<string>()
      let keepWalking = true
      while (keepWalking) {
        keepWalking = false
        for (const item of current) {
          if (item.parentId && (item.parentId === source.id || descendants.has(item.parentId)) && !descendants.has(item.id)) {
            descendants.add(item.id)
            keepWalking = true
          }
        }
      }
      if (target.id === source.id || descendants.has(target.id)) return current

      const without = current.filter(item => item.id !== source.id)
      let parentId: string | null = target.parentId ?? null
      if (mode === 'child') parentId = target.id
      const moved = { ...source, parentId }
      const siblings = without.filter(item => (item.parentId ?? null) === parentId)
      const all = [...without]
      const targetIndex = all.findIndex(item => item.id === target.id)
      if (mode === 'child') return [...all, moved]
      if (targetIndex < 0) return [...all, moved]
      let insertAt = targetIndex + (mode === 'after' ? 1 : 0)
      if (mode === 'after') {
        while (insertAt < all.length && (all[insertAt].parentId ?? null) === parentId) insertAt += 1
      }
      if (siblings.length === 0) return [...all.slice(0, insertAt), moved, ...all.slice(insertAt)]
      return [...all.slice(0, insertAt), moved, ...all.slice(insertAt)]
    })
    setDragId(null)
    setDropId(null)
  }

  const moveLevel = (id: string, direction: 'indent' | 'outdent') => {
    const flat = flatten(items)
    const index = flat.findIndex(row => row.item.id === id)
    if (index < 0) return
    const current = flat[index]
    if (direction === 'indent') {
      const previous = flat[index - 1]
      if (!previous || previous.depth !== current.depth) {
        const siblingAtSameDepth = [...flat.slice(0, index)].reverse().find(row => row.depth === current.depth)
        if (!siblingAtSameDepth) return
        patch(id, { parentId: siblingAtSameDepth.item.id })
        return
      }
      patch(id, { parentId: previous.item.id })
      return
    }
    if (!current.item.parentId) return
    const parent = items.find(item => item.id === current.item.parentId)
    if (parent) patch(id, { parentId: parent.parentId ?? null })
  }

  const previewRoots = rows.filter(row => row.depth === 0).map(row => row.item)

  return (
    <div className="navProPage">
      <div className="navProHeader">
        <div>
          <div className="navEyebrow">ONLINE STORE</div>
          <h1 className="h2">Navigation</h1>
          <p className="muted">Create and organize menus just like Shopify. Drag items to reorder or nest them into dropdowns.</p>
        </div>
        <div className="inline">
          <button className="btn secondary" onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? 'Hide preview' : 'Show preview'}</button>
          <button className="btn" onClick={save} disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {(notice || error) && <div className={error ? 'alert danger' : 'alert'}>{error || notice}</div>}

      <div className={`navShopifyLayout ${previewOpen ? 'withPreview' : ''}`}>
        <section className="navShopifyBuilder card">
          <div className="navMenuHeader">
            <div>
              <div className="navMenuTitle"><strong>Main menu</strong><span className="navSavedDot">Saved</span></div>
              <p className="muted">Your primary storefront navigation</p>
            </div>
            <button className="iconBtn" title="Menu settings"><Settings2 size={16} /></button>
          </div>

          <div className="navToolbar">
            <button className="btn secondary" onClick={() => addItem('custom')}><Plus size={15} /> Add menu item</button>
            <div className="navToolbarHint">{roots.length} top-level items</div>
          </div>

          <div className="navItemsList">
            {rows.length === 0 && <div className="navEmpty"><Link2 size={25}/><strong>Your menu is empty</strong><span className="muted">Add a menu item to start building your storefront navigation.</span><button className="btn" onClick={() => addItem('custom')}><Plus size={15}/> Add menu item</button></div>}
            {rows.map(({ item, depth }) => {
              const hasChildren = items.some(child => child.parentId === item.id)
              const isDropTarget = dropId === item.id
              return (
                <div key={item.id} className={`navItemWrap depth-${Math.min(depth, 3)}`}>
                  <div
                    className={`navShopifyItem ${isDropTarget ? 'dropTarget' : ''}`}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={event => { event.preventDefault(); setDropId(item.id) }}
                    onDragLeave={() => setDropId(null)}
                    onDrop={event => { event.preventDefault(); if (dragId) reorderAfterDrop(dragId, item.id, 'after') }}
                  >
                    <GripVertical className="navGrip" size={18}/>
                    <div className="navItemMain">
                      <strong>{item.label}</strong>
                      <span>{item.url || 'No link assigned'}</span>
                    </div>
                    {hasChildren && <span className="navChildBadge"><ChevronDown size={13}/>Dropdown</span>}
                    <button className="navItemAction" onClick={() => setEditing(item)}><Settings2 size={15}/></button>
                    <button className="navItemAction danger" onClick={() => remove(item.id)}><Trash2 size={15}/></button>
                  </div>
                  {isDropTarget && dragId && <div className="navDropActions"><button onClick={() => reorderAfterDrop(dragId, item.id, 'before')}>Place above</button><button onClick={() => reorderAfterDrop(dragId, item.id, 'child')}>Make submenu</button><button onClick={() => reorderAfterDrop(dragId, item.id, 'after')}>Place below</button></div>}
                  {hasChildren && <div className="navChildRail"><ChevronRight size={14}/>{items.filter(child => child.parentId === item.id).map(child => <span key={child.id}>{child.label}</span>)}</div>}
                </div>
              )
            })}
          </div>

          <div className="navHelp"><strong>How menus work</strong><span>Drag a menu item to reorder it. Use “Make submenu” to create a dropdown. Edit an item to choose a collection, category or custom URL.</span></div>
        </section>

        {previewOpen && <aside className="navPreviewPane card">
          <div className="navPreviewHeader"><div><strong>Storefront preview</strong><span className="muted">Your header navigation</span></div><span className="previewBadge">Desktop</span></div>
          <div className="navPreviewBrowser"><div className="browserDots"><i/><i/><i/></div><div className="previewHeaderBar"><strong>YOUR BRAND</strong><div className="previewLinks">{previewRoots.map(item => <span key={item.id}>{item.label}{items.some(child => child.parentId === item.id) && <ChevronDown size={12}/>}</span>)}</div><div className="previewIcons">♡　⌕　Bag</div></div><div className="previewHero"><span>Storefront preview</span><strong>Build your navigation</strong><small>Dropdowns and nested links are reflected here.</small></div></div>
        </aside>}
      </div>

      {editing && <div className="navModalOverlay" onMouseDown={() => setEditing(null)}><div className="navEditPanel" onMouseDown={event => event.stopPropagation()}>
        <div className="navEditHeader"><div><div className="navEyebrow">MENU ITEM</div><h2>{editing.label || 'Menu item'}</h2></div><button className="iconBtn" onClick={() => setEditing(null)}><X size={17}/></button></div>
        <label className="fieldLabel">Name<input className="input" value={editing.label} onChange={event => { const next = { ...editing, label: event.target.value }; setEditing(next); patch(editing.id, { label: event.target.value }) }}/></label>
        <label className="fieldLabel">Link type<select className="input" value={editing.type || 'custom'} onChange={event => { const type = event.target.value; const next = { ...editing, type }; setEditing(next); patch(editing.id, { type }) }}><option value="custom">Custom link</option><option value="collection">Collection</option><option value="category">Category</option></select></label>
        {editing.type === 'collection' && <label className="fieldLabel">Collection<select className="input" value={editing.resourceId || ''} onChange={event => { const resourceId = event.target.value; const collection = collections.find(x => x.id === resourceId); const next = { ...editing, resourceId, label: collection?.name || editing.label, url: collection ? `/collections/${collection.slug}` : '/collections' }; setEditing(next); patch(editing.id, { resourceId, label: next.label, url: next.url }) }}><option value="">Choose a collection</option>{collections.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {editing.type === 'category' && <label className="fieldLabel">Category<select className="input" value={editing.resourceId || ''} onChange={event => { const resourceId = event.target.value; const category = categories.find(x => x.id === resourceId); const next = { ...editing, resourceId, label: category?.name || editing.label, url: category ? `/shop?category=${category.slug}` : '/shop' }; setEditing(next); patch(editing.id, { resourceId, label: next.label, url: next.url }) }}><option value="">Choose a category</option>{categories.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {(!editing.type || editing.type === 'custom') && <label className="fieldLabel">URL<input className="input" value={editing.url || ''} onChange={event => { setEditing({ ...editing, url: event.target.value }); patch(editing.id, { url: event.target.value }) }} placeholder="/collections/all" /></label>}
        <div className="navEditTip"><strong>Dropdown:</strong> To place this item inside another item, close this panel and drag it onto the parent, then choose “Make submenu”.</div>
        <div className="navEditFooter"><button className="btn secondary" onClick={() => setEditing(null)}>Done</button><button className="btn dangerBtn" onClick={() => { remove(editing.id); setEditing(null) }}>Remove item</button></div>
      </div></div>}
    </div>
  )
}
