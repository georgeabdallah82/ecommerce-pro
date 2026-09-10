'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Link2, Plus, Save, Settings2, Trash2, X } from 'lucide-react'
import styles from './admin-navigation-editor.module.css'

type Item = { id: string; label: string; url?: string | null; type?: string; parentId?: string | null; resourceId?: string | null }
type Props = { initial: Item[]; categories: any[]; collections: any[] }
type Draft = { label: string; type: 'custom' | 'collection' | 'category'; url: string; resourceId: string; parentId: string | null }

const newId = () => `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const childrenOf = (items: Item[], parentId: string | null) => items.filter(x => (x.parentId ?? null) === parentId)
const descendants = (items: Item[], id: string) => {
  const out = new Set<string>()
  const walk = (parent: string) => {
    items.filter(x => x.parentId === parent).forEach(x => {
      if (!out.has(x.id)) {
        out.add(x.id)
        walk(x.id)
      }
    })
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

  const patch = (id: string, patchData: Partial<Item>) => setItems(cur => cur.map(x => (x.id === id ? { ...x, ...patchData } : x)))
  const remove = (id: string) => {
    const ids = new Set([id, ...descendants(items, id)])
    setItems(cur => cur.filter(x => !ids.has(x.id)))
    if (editor?.id === id) setEditor(null)
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
      setNotice('Navigation saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save navigation')
    } finally {
      setSaving(false)
    }
  }

  const createItem = (draft: Draft) => {
    const item: Item = {
      id: newId(),
      label: draft.label.trim() || (draft.parentId ? 'New submenu item' : 'New menu item'),
      type: draft.type,
      url: draft.url || '#',
      resourceId: draft.resourceId || null,
      parentId: draft.parentId,
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
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>ONLINE STORE · NAVIGATION</div>
          <h1>Navigation</h1>
          <p className="muted">Build your menus without fighting drag-and-drop. Add a menu item, choose where it belongs, and Shopify-style dropdowns are created automatically.</p>
        </div>
        <div className="inline">
          <button className="btn secondary" onClick={() => setPreviewOpen(v => !v)}>{previewOpen ? 'Hide preview' : 'Show preview'}</button>
          <button className="btn" onClick={save} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {(notice || error) && <div className={`alert ${styles.alertSpacing} ${error ? 'danger' : ''}`}>{error || notice}</div>}

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <strong>Main menu</strong>
              <span>What customers see in your store header.</span>
            </div>
            <span className={styles.saveDot}>{saving ? 'Saving…' : 'Unsaved changes'}</span>
          </div>

          <div className={styles.toolbar}>
            <button className="btn secondary" onClick={() => setAdding({ parentId: null })}><Plus size={15} /> Add menu item</button>
            <div className={styles.toolbarHint}>{roots.length} top-level items</div>
          </div>

          <div className={styles.tree}>
            {roots.length === 0 && (
              <div className={styles.emptyState}>
                <Link2 size={26} />
                <strong>No menu items yet</strong>
                <span className="muted">Start with your first menu item.</span>
                <button className="btn" onClick={() => setAdding({ parentId: null })}><Plus size={15} /> Add menu item</button>
              </div>
            )}
            {roots.map(root => {
              const children = childrenOf(items, root.id)
              return (
                <div
                  className={styles.treeItem}
                  key={root.id}
                  onDragOver={e => {
                    e.preventDefault()
                    if (dragId && dragId !== root.id && !descendants(items, dragId).has(root.id)) e.currentTarget.classList.add(styles.dragOver)
                  }}
                  onDragLeave={e => e.currentTarget.classList.remove(styles.dragOver)}
                  onDrop={e => {
                    e.preventDefault()
                    e.currentTarget.classList.remove(styles.dragOver)
                    const source = e.dataTransfer.getData('text/plain') || dragId
                    if (source) handleDrop(root.id)
                  }}
                >
                  <div className={styles.row}>
                    <span
                      className={styles.grip}
                      draggable
                      onDragStart={e => {
                        e.stopPropagation()
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', root.id)
                        setDragId(root.id)
                      }}
                      onDragEnd={() => setDragId(null)}
                    >
                      <GripVertical size={18} />
                    </span>
                    <div className={styles.itemMain} onClick={() => setEditor(root)}>
                      <strong>{root.label}</strong>
                      <small>{root.url || 'No destination'}</small>
                    </div>
                    {children.length > 0 && (
                      <span className={styles.parentBadge}><ChevronDown size={12} /> {children.length} submenu</span>
                    )}
                    <div className={styles.actions}>
                      <button className={`${styles.action} ${styles.actionPrimary}`} onClick={() => setAdding({ parentId: root.id })}><Plus size={13} /> Submenu</button>
                      <button className={styles.action} onClick={() => setEditor(root)} title="Edit"><Settings2 size={14} /></button>
                      <button className={`${styles.action} ${styles.actionDanger}`} onClick={() => remove(root.id)} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {children.length > 0 && (
                    <div className={styles.childList}>
                      {children.map(child => (
                        <div className={styles.childRow} key={child.id}>
                          <span
                            className={styles.grip}
                            draggable
                            onDragStart={e => {
                              e.stopPropagation()
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', child.id)
                              setDragId(child.id)
                            }}
                            onDragEnd={() => setDragId(null)}
                          >
                            <GripVertical size={16} />
                          </span>
                          <div className={styles.childLabel} onClick={() => setEditor(child)}>
                            <strong>{child.label}</strong>
                            <small>{child.url || 'No destination'}</small>
                          </div>
                          <button className={styles.action} onClick={() => setAdding({ parentId: child.id })}><Plus size={13} /></button>
                          <button className={styles.action} onClick={() => moveItem(child.id, null)} title="Move to main menu"><ChevronRight size={14} /></button>
                          <button className={styles.action} onClick={() => setEditor(child)}><Settings2 size={14} /></button>
                          <button className={`${styles.action} ${styles.actionDanger}`} onClick={() => remove(child.id)}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button className={styles.addSubBtn} onClick={() => setAdding({ parentId: root.id })}>+ Add submenu item</button>
                </div>
              )
            })}
          </div>

          <div className={styles.toolbar}>
            <div className={styles.toolbarHint}>Tip: You can use the Submenu button instead of dragging anything.</div>
            <button className="btn secondary" onClick={() => setAdding({ parentId: null })}><Plus size={15} /> Add another item</button>
          </div>
        </section>

        {previewOpen && (
          <aside className={`${styles.panel} ${styles.previewPanel}`}>
            <div className={styles.panelHead}>
              <div>
                <strong>Storefront preview</strong>
                <span>Header + dropdown structure</span>
              </div>
              <span className="previewBadge">Desktop</span>
            </div>
            <div className={styles.browser}>
              <div className={styles.browserTop}>
                <i className={styles.dot} />
                <i className={styles.dot} />
                <i className={styles.dot} />
              </div>
              <div className={styles.storeHeader}>
                <span className={styles.brand}>YOUR BRAND</span>
                <div className={styles.previewLinks}>
                  {roots.map(root => (
                    <span key={root.id}>{root.label}{childrenOf(items, root.id).length > 0 && <ChevronDown size={11} />}</span>
                  ))}
                </div>
                <span className={`muted ${styles.previewCartHint}`}>Bag</span>
              </div>
              <div className={styles.mockHero}>
                <small>LIVE PREVIEW</small>
                <strong>Navigation built the easy way.</strong>
                <span>Dropdowns and submenu hierarchy follow your menu structure.</span>
              </div>
            </div>
          </aside>
        )}
      </div>

      {(adding || editor) && (
        <div className={styles.overlay} onMouseDown={() => { setAdding(null); setEditor(null) }}>
          {adding && (
            <AddDrawer parentId={adding.parentId} items={items} categories={categories} collections={collections} onClose={() => setAdding(null)} onCreate={createItem} />
          )}
          {editor && !adding && (
            <EditDrawer item={editor} items={items} categories={categories} collections={collections} onClose={() => setEditor(null)} patch={patch} remove={remove} />
          )}
        </div>
      )}
    </div>
  )
}

function emptyDraft(parentId: string | null): Draft {
  return { label: '', type: 'custom', url: '', resourceId: '', parentId }
}

function AddDrawer({ parentId, items, categories, collections, onClose, onCreate }: {
  parentId: string | null
  items: Item[]
  categories: any[]
  collections: any[]
  onClose: () => void
  onCreate: (d: Draft) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(parentId))
  const parents = items.filter(x => x.id !== parentId)
  const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }))
  const chooseCollection = (id: string) => {
    const c = collections.find(x => x.id === id)
    set({ resourceId: id, label: c?.name || '', url: c ? `/collections/${c.slug}` : '' })
  }
  const chooseCategory = (id: string) => {
    const c = categories.find(x => x.id === id)
    set({ resourceId: id, label: c?.name || '', url: c ? `/shop?category=${c.slug}` : '' })
  }

  return (
    <div className={styles.drawer} onMouseDown={e => e.stopPropagation()}>
      <div className={styles.drawerHead}>
        <div>
          <div className={styles.eyebrow}>ADD MENU ITEM</div>
          <h2 className={styles.drawerTitle}>Create menu item</h2>
        </div>
        <button className="iconBtn" onClick={onClose}><X size={17} /></button>
      </div>
      <div className={styles.drawerBody}>
        <div className={styles.field}>
          <label>Where should it appear?</label>
          <select value={draft.parentId || ''} onChange={e => set({ parentId: e.target.value || null })}>
            <option value="">Main menu</option>
            {parents.map(p => <option key={p.id} value={p.id}>Under “{p.label}”</option>)}
          </select>
        </div>

        <div className={styles.destination}>
          <strong>{draft.parentId ? `Dropdown under “${items.find(x => x.id === draft.parentId)?.label || ''}”` : 'Top-level menu item'}</strong>
          <div className={`muted ${styles.destinationNote}`}>You can change the parent here without dragging.</div>
        </div>

        <div className={styles.field}>
          <label>Link type</label>
          <select
            value={draft.type}
            onChange={e => set({ type: e.target.value as Draft['type'], resourceId: '', label: e.target.value === 'custom' ? '' : draft.label, url: e.target.value === 'custom' ? draft.url : '' })}
          >
            <option value="custom">Custom URL</option>
            <option value="collection">Collection</option>
            <option value="category">Category</option>
          </select>
        </div>

        {draft.type === 'collection' && (
          <div className={styles.field}>
            <label>Collection</label>
            <select value={draft.resourceId} onChange={e => chooseCollection(e.target.value)}>
              <option value="">Select collection</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {draft.type === 'category' && (
          <div className={styles.field}>
            <label>Category</label>
            <select value={draft.resourceId} onChange={e => chooseCategory(e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label>Label</label>
          <input value={draft.label} onChange={e => set({ label: e.target.value })} placeholder="e.g. Men" />
        </div>
        {draft.type === 'custom' && (
          <div className={styles.field}>
            <label>URL</label>
            <input value={draft.url} onChange={e => set({ url: e.target.value })} placeholder="/collections/all" />
          </div>
        )}

        <div className={styles.hint}><strong>Shopify-style workflow:</strong> choose the parent first, then choose the destination. No dragging is required to create dropdowns.</div>
      </div>
      <div className={styles.drawerFoot}>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => onCreate(draft)} disabled={!draft.label.trim() || !draft.url}>Add item</button>
      </div>
    </div>
  )
}

function EditDrawer({ item, items, categories, collections, onClose, patch, remove }: {
  item: Item
  items: Item[]
  categories: any[]
  collections: any[]
  onClose: () => void
  patch: (id: string, p: Partial<Item>) => void
  remove: (id: string) => void
}) {
  const [draft, setDraft] = useState(item)
  const set = (p: Partial<Item>) => setDraft(d => ({ ...d, ...p }))
  const chooseCollection = (id: string) => {
    const c = collections.find(x => x.id === id)
    const next = { resourceId: id, label: c?.name || draft.label, url: c ? `/collections/${c.slug}` : '/collections' }
    set(next)
    patch(item.id, next)
  }
  const chooseCategory = (id: string) => {
    const c = categories.find(x => x.id === id)
    const next = { resourceId: id, label: c?.name || draft.label, url: c ? `/shop?category=${c.slug}` : '/shop' }
    set(next)
    patch(item.id, next)
  }
  const parents = items.filter(x => x.id !== item.id && !(() => {
    const stack = [item.id]
    const setIds = new Set([item.id])
    while (stack.length) {
      const p = stack.pop()!
      items.filter(i => i.parentId === p).forEach(i => {
        if (!setIds.has(i.id)) {
          setIds.add(i.id)
          stack.push(i.id)
        }
      })
    }
    return setIds.has(x.id)
  })())

  return (
    <div className={styles.drawer} onMouseDown={e => e.stopPropagation()}>
      <div className={styles.drawerHead}>
        <div>
          <div className={styles.eyebrow}>MENU ITEM</div>
          <h2 className={styles.drawerTitle}>{item.label || 'Menu item'}</h2>
        </div>
        <button className="iconBtn" onClick={onClose}><X size={17} /></button>
      </div>
      <div className={styles.drawerBody}>
        <div className={styles.field}>
          <label>Parent</label>
          <select
            value={draft.parentId || ''}
            onChange={e => {
              const parentId = e.target.value || null
              set({ parentId })
              patch(item.id, { parentId })
            }}
          >
            <option value="">Main menu</option>
            {parents.map(p => <option key={p.id} value={p.id}>Under “{p.label}”</option>)}
          </select>
        </div>

        <div className={styles.field}>
          <label>Link type</label>
          <select
            value={draft.type || 'custom'}
            onChange={e => {
              const type = e.target.value
              set({ type })
              patch(item.id, { type })
            }}
          >
            <option value="custom">Custom URL</option>
            <option value="collection">Collection</option>
            <option value="category">Category</option>
          </select>
        </div>

        {draft.type === 'collection' && (
          <div className={styles.field}>
            <label>Collection</label>
            <select value={draft.resourceId || ''} onChange={e => chooseCollection(e.target.value)}>
              <option value="">Select collection</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {draft.type === 'category' && (
          <div className={styles.field}>
            <label>Category</label>
            <select value={draft.resourceId || ''} onChange={e => chooseCategory(e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label>Label</label>
          <input value={draft.label} onChange={e => {
            const label = e.target.value
            set({ label })
            patch(item.id, { label })
          }} />
        </div>
        {(!draft.type || draft.type === 'custom') && (
          <div className={styles.field}>
            <label>URL</label>
            <input value={draft.url || ''} onChange={e => {
              const url = e.target.value
              set({ url })
              patch(item.id, { url })
            }} />
          </div>
        )}
      </div>
      <div className={styles.drawerFoot}>
        <button className="btn secondary" onClick={onClose}>Done</button>
        <button className={styles.removeBtn} onClick={() => { remove(item.id); onClose() }}>Remove item</button>
      </div>
    </div>
  )
}
