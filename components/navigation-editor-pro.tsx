'use client'

import { useMemo, useState } from 'react'
import { GripVertical, ImagePlus, LayoutGrid, Link2, ListTree, Plus, Save, Trash2, X } from 'lucide-react'
import styles from './admin-navigation-editor.module.css'
import ui from './admin-ui.module.css'
import MediaPicker from './media-picker'

type Item = { id: string; label: string; url?: string | null; type?: string; parentId?: string | null; resourceId?: string | null; group?: string | null; imageUrl?: string | null }
type Props = { initial: Item[]; collections: any[] }
type LinkKind = 'tile' | 'link' | 'sublink'
type Draft = { label: string; linkType: 'custom' | 'collection'; url: string; resourceId: string; group: string; imageUrl: string }

const newId = () => `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const childrenOf = (items: Item[], parentId: string | null) => items.filter(x => (x.parentId ?? null) === parentId)

const descendants = (items: Item[], id: string) => {
  const out = new Set<string>()
  const walk = (parent: string) => {
    items.filter(x => x.parentId === parent).forEach(x => {
      if (!out.has(x.id)) { out.add(x.id); walk(x.id) }
    })
  }
  walk(id)
  return out
}

function normalize(items: Item[]) {
  const valid = new Set(items.map(x => x.id))
  return items.map(x => ({ ...x, parentId: x.parentId && valid.has(x.parentId) ? x.parentId : null }))
}

// Mirrors components/store-nav-fixed.tsx's groupChildren exactly, so what the editor
// shows as "groups" and "other links" is the same bucketing the storefront dropdown
// and mobile menu actually render -- tiles (imageUrl) are shown separately.
function groupLinkChildren(children: Item[]) {
  const groups: { name: string; items: Item[] }[] = []
  const ungrouped: Item[] = []
  for (const child of children) {
    if (child.imageUrl) continue
    const name = child.group?.trim()
    if (!name) { ungrouped.push(child); continue }
    let bucket = groups.find(g => g.name === name)
    if (!bucket) { bucket = { name, items: [] }; groups.push(bucket) }
    bucket.items.push(child)
  }
  return { groups, ungrouped }
}

function reorderItems(items: Item[], dragId: string, targetId: string) {
  const from = items.findIndex(x => x.id === dragId)
  if (from === -1 || dragId === targetId) return items
  const copy = items.slice()
  const [moved] = copy.splice(from, 1)
  const to = copy.findIndex(x => x.id === targetId)
  if (to === -1) return items
  copy.splice(to, 0, moved)
  return copy
}

function emptyDraft(): Draft {
  return { label: '', linkType: 'custom', url: '', resourceId: '', group: '', imageUrl: '' }
}

function draftFromItem(item: Item): Draft {
  return {
    label: item.label || '',
    linkType: item.type === 'collection' ? 'collection' : 'custom',
    url: item.url || '',
    resourceId: item.resourceId || '',
    group: item.group || '',
    imageUrl: item.imageUrl || '',
  }
}

export default function NavigationEditorPro({ initial, collections }: Props) {
  const [items, setItems] = useState<Item[]>(() => normalize(initial || []))
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const roots = useMemo(() => childrenOf(items, null), [items])
  const [activeDeptId, setActiveDeptId] = useState<string | null>(null)
  const activeDept = useMemo(() => roots.find(r => r.id === activeDeptId) || roots[0] || null, [roots, activeDeptId])
  const deptChildren = useMemo(() => (activeDept ? childrenOf(items, activeDept.id) : []), [items, activeDept])
  const tiles = useMemo(() => deptChildren.filter(c => c.imageUrl), [deptChildren])
  const { groups, ungrouped } = useMemo(() => groupLinkChildren(deptChildren), [deptChildren])
  const groupNames = useMemo(() => groups.map(g => g.name), [groups])

  const [drawer, setDrawer] = useState<{ mode: 'add' | 'edit'; kind: LinkKind; parentId: string; item?: Item; requireGroup?: boolean; presetGroup?: string } | null>(null)

  const patch = (id: string, patchData: Partial<Item>) => setItems(cur => cur.map(x => (x.id === id ? { ...x, ...patchData } : x)))

  const remove = (id: string) => {
    const ids = new Set([id, ...descendants(items, id)])
    setItems(cur => cur.filter(x => !ids.has(x.id)))
    if (activeDeptId === id) setActiveDeptId(null)
    setDrawer(null)
  }

  const addDepartment = () => {
    const item: Item = { id: newId(), label: 'New department', type: 'custom', url: '#', parentId: null }
    setItems(cur => [...cur, item])
    setActiveDeptId(item.id)
  }

  const renameGroup = (oldName: string, newName: string) => {
    if (!activeDept) return
    const trimmed = newName.trim()
    setItems(cur => cur.map(x => (x.parentId === activeDept.id && !x.imageUrl && (x.group || '').trim() === oldName ? { ...x, group: trimmed || null } : x)))
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

  const submitDrawer = (draft: Draft) => {
    if (!drawer) return
    const data: Partial<Item> = {
      label: draft.label.trim() || 'Untitled',
      type: draft.linkType,
      url: draft.linkType === 'custom' ? (draft.url || '#') : draft.url,
      resourceId: draft.linkType === 'collection' ? draft.resourceId || null : null,
      group: drawer.kind === 'link' ? (draft.group.trim() || null) : null,
      imageUrl: drawer.kind === 'tile' ? (draft.imageUrl || null) : null,
    }
    if (drawer.mode === 'add') {
      setItems(cur => [...cur, { id: newId(), parentId: drawer.parentId, ...data } as Item])
    } else if (drawer.item) {
      patch(drawer.item.id, data)
    }
    setDrawer(null)
  }

  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDragId(id) },
    onDragEnd: () => setDragId(null),
  })
  const dropProps = (targetId: string, allowed: Set<string>) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId && dragId !== targetId && allowed.has(dragId)) e.preventDefault() },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const source = e.dataTransfer.getData('text/plain') || dragId
      if (source && source !== targetId && allowed.has(source)) setItems(cur => reorderItems(cur, source, targetId))
      setDragId(null)
    },
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>ONLINE STORE · NAVIGATION</div>
          <h1>Navigation</h1>
          <p className={ui.muted}>Build departments the way your storefront actually renders them: image tiles, numbered link groups, and plain links. No dropdown wiring required.</p>
        </div>
        <div className="inline">
          <button className={ui.btn} onClick={save} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {(notice || error) && <div className={`${ui.alert} ${styles.alertSpacing} ${error ? ui.alertDanger : ''}`}>{error || notice}</div>}

      <div className={styles.builderGrid}>
        <aside className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <strong>Departments</strong>
              <span>Top-level menu items</span>
            </div>
          </div>
          <div className={styles.deptRail}>
            {roots.length === 0 && (
              <div className={styles.emptyState}>
                <Link2 size={22} />
                <strong>No departments yet</strong>
                <span className={ui.muted}>A department is a top-level menu item, e.g. “Women” or “Sale”.</span>
              </div>
            )}
            {roots.map(root => (
              <div
                key={root.id}
                className={`${styles.deptRow} ${activeDept?.id === root.id ? styles.deptRowActive : ''}`}
                {...dragProps(root.id)}
                {...dropProps(root.id, new Set(roots.map(r => r.id)))}
                onClick={() => setActiveDeptId(root.id)}
              >
                <span className={styles.grip}><GripVertical size={16} /></span>
                <div className={styles.deptRowMain}>
                  <strong>{root.label}</strong>
                  <small>{childrenOf(items, root.id).length} item{childrenOf(items, root.id).length === 1 ? '' : 's'}</small>
                </div>
                <button
                  className={`${styles.action} ${styles.actionDanger}`}
                  onClick={e => { e.stopPropagation(); remove(root.id) }}
                  title="Delete department"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className={styles.toolbar}>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addDepartment}><Plus size={15} /> Add department</button>
          </div>
        </aside>

        <section className={styles.panel}>
          {!activeDept ? (
            <div className={styles.emptyState}>
              <LayoutGrid size={26} />
              <strong>Select or add a department</strong>
              <span className={ui.muted}>Departments hold your image tiles and link groups.</span>
            </div>
          ) : (
            <>
              <div className={styles.deptSettings}>
                <div className={styles.field}>
                  <label>Department label</label>
                  <input value={activeDept.label} onChange={e => patch(activeDept.id, { label: e.target.value })} placeholder="e.g. Women" />
                </div>
                <DestinationFields
                  linkType={activeDept.type === 'collection' ? 'collection' : 'custom'}
                  url={activeDept.url || ''}
                  resourceId={activeDept.resourceId || ''}
                  collections={collections}
                  onChange={next => patch(activeDept.id, {
                    type: next.linkType,
                    url: next.url,
                    resourceId: next.linkType === 'collection' ? next.resourceId : null,
                  })}
                />
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <strong>Image tiles</strong>
                    <span className={ui.muted}>Shown across the top of the dropdown, in order.</span>
                  </div>
                  <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setDrawer({ mode: 'add', kind: 'tile', parentId: activeDept.id })}><ImagePlus size={14} /> Add tile</button>
                </div>
                {tiles.length === 0 ? (
                  <div className={styles.sectionEmpty}>No image tiles yet.</div>
                ) : (
                  <div className={styles.tileRow}>
                    {tiles.map(tile => (
                      <div key={tile.id} className={styles.tileCard} {...dragProps(tile.id)} {...dropProps(tile.id, new Set(tiles.map(t => t.id)))}>
                        <div className={styles.tileImg} style={{ backgroundImage: `url(${tile.imageUrl})` }} />
                        <div className={styles.tileLabel}>{tile.label}</div>
                        <div className={styles.tileActions}>
                          <button className={styles.action} onClick={() => setDrawer({ mode: 'edit', kind: 'tile', parentId: activeDept.id, item: tile })}>Edit</button>
                          <button className={`${styles.action} ${styles.actionDanger}`} onClick={() => remove(tile.id)}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <strong>Link groups</strong>
                    <span className={ui.muted}>Links sharing a heading are numbered together, in the order headings first appear.</span>
                  </div>
                  <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setDrawer({ mode: 'add', kind: 'link', parentId: activeDept.id, requireGroup: true })}><Plus size={14} /> Add group</button>
                </div>
                {groups.length === 0 && <div className={styles.sectionEmpty}>No link groups yet.</div>}
                {groups.map((group, i) => (
                  <div key={group.name} className={styles.groupCard}>
                    <div className={styles.groupCardHead}>
                      <span className={styles.groupNum}>{String(i + 1).padStart(2, '0')}</span>
                      <input
                        className={styles.groupNameInput}
                        defaultValue={group.name}
                        onBlur={e => { if (e.target.value.trim() !== group.name) renameGroup(group.name, e.target.value) }}
                      />
                    </div>
                    <LinkList
                      links={group.items}
                      allLinkIds={group.items.map(l => l.id)}
                      dragProps={dragProps}
                      dropProps={dropProps}
                      items={items}
                      onEdit={link => setDrawer({ mode: 'edit', kind: 'link', parentId: activeDept.id, item: link })}
                      onAddSub={link => setDrawer({ mode: 'add', kind: 'sublink', parentId: link.id })}
                      onEditSub={sub => setDrawer({ mode: 'edit', kind: 'sublink', parentId: sub.parentId || '', item: sub })}
                      onRemove={remove}
                    />
                    <button className={styles.addGhostBtn} onClick={() => setDrawer({ mode: 'add', kind: 'link', parentId: activeDept.id, presetGroup: group.name })}>+ Add link to “{group.name}”</button>
                  </div>
                ))}
              </div>

              <div className={styles.sectionCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <strong>Other links</strong>
                    <span className={ui.muted}>Plain links with no group heading.</span>
                  </div>
                  <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setDrawer({ mode: 'add', kind: 'link', parentId: activeDept.id })}><Plus size={14} /> Add link</button>
                </div>
                {ungrouped.length === 0 ? (
                  <div className={styles.sectionEmpty}>No plain links yet.</div>
                ) : (
                  <LinkList
                    links={ungrouped}
                    allLinkIds={ungrouped.map(l => l.id)}
                    dragProps={dragProps}
                    dropProps={dropProps}
                    items={items}
                    onEdit={link => setDrawer({ mode: 'edit', kind: 'link', parentId: activeDept.id, item: link })}
                    onAddSub={link => setDrawer({ mode: 'add', kind: 'sublink', parentId: link.id })}
                    onEditSub={sub => setDrawer({ mode: 'edit', kind: 'sublink', parentId: sub.parentId || '', item: sub })}
                    onRemove={remove}
                  />
                )}
              </div>
            </>
          )}
        </section>

        {activeDept && (
          <aside className={`${styles.panel} ${styles.previewPanel}`}>
            <div className={styles.panelHead}>
              <div>
                <strong>Preview</strong>
                <span>“{activeDept.label}” dropdown</span>
              </div>
              <span className={ui.pill}>Structure</span>
            </div>
            <div className={styles.previewBody}>
              {tiles.length > 0 && (
                <div className={styles.previewTileRow}>
                  {tiles.map(tile => (
                    <div key={tile.id} className={styles.previewTile}>
                      <span className={styles.previewTileImg} style={{ backgroundImage: `url(${tile.imageUrl})` }} />
                      <small>{tile.label}</small>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.previewGroupGrid}>
                {groups.map((group, i) => (
                  <div key={group.name} className={styles.previewGroup}>
                    <div className={styles.previewGroupHead}><span>{String(i + 1).padStart(2, '0')}</span>{group.name}</div>
                    <div className={styles.previewGroupLinks}>
                      {group.items.map(link => (
                        <div key={link.id}>
                          <span>{link.label}</span>
                          {childrenOf(items, link.id).length > 0 && (
                            <div className={styles.previewSubLinks}>
                              {childrenOf(items, link.id).map(sub => <span key={sub.id}>{sub.label}</span>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div className={styles.previewGroup}>
                    <div className={styles.previewGroupLinks}>
                      {ungrouped.map(link => (
                        <div key={link.id}>
                          <span>{link.label}</span>
                          {childrenOf(items, link.id).length > 0 && (
                            <div className={styles.previewSubLinks}>
                              {childrenOf(items, link.id).map(sub => <span key={sub.id}>{sub.label}</span>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {tiles.length === 0 && groups.length === 0 && ungrouped.length === 0 && (
                  <div className={ui.muted}>Nothing in this department yet.</div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {drawer && (
        <div className={styles.overlay} onMouseDown={() => setDrawer(null)}>
          <LinkDrawer
            drawer={drawer}
            collections={collections}
            groupNames={groupNames}
            onClose={() => setDrawer(null)}
            onSubmit={submitDrawer}
            onDelete={drawer.item ? () => remove(drawer.item!.id) : undefined}
          />
        </div>
      )}
    </div>
  )
}

function LinkList({ links, dragProps, dropProps, items, onEdit, onAddSub, onEditSub, onRemove }: {
  links: Item[]
  allLinkIds: string[]
  dragProps: (id: string) => any
  dropProps: (targetId: string, allowed: Set<string>) => any
  items: Item[]
  onEdit: (item: Item) => void
  onAddSub: (item: Item) => void
  onEditSub: (item: Item) => void
  onRemove: (id: string) => void
}) {
  const allowed = new Set(links.map(l => l.id))
  return (
    <div className={styles.linkList}>
      {links.map(link => {
        const subLinks = childrenOf(items, link.id)
        return (
          <div key={link.id} className={styles.linkRow} {...dragProps(link.id)} {...dropProps(link.id, allowed)}>
            <div className={styles.linkRowMain}>
              <span className={styles.grip}><GripVertical size={14} /></span>
              <div className={styles.linkLabel} onClick={() => onEdit(link)}>
                <strong>{link.label}</strong>
                <small>{link.url || 'No destination'}</small>
              </div>
              <button className={styles.action} onClick={() => onAddSub(link)} title="Add sub-link"><ListTree size={13} /></button>
              <button className={`${styles.action} ${styles.actionDanger}`} onClick={() => onRemove(link.id)} title="Delete"><Trash2 size={13} /></button>
            </div>
            {subLinks.length > 0 && (
              <div className={styles.subLinkList}>
                {subLinks.map(sub => (
                  <div key={sub.id} className={styles.subLinkRow} onClick={() => onEditSub(sub)}>
                    <span>{sub.label}</span>
                    <button className={`${styles.action} ${styles.actionDanger}`} onClick={e => { e.stopPropagation(); onRemove(sub.id) }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DestinationFields({ linkType, url, resourceId, collections, onChange }: {
  linkType: 'custom' | 'collection'
  url: string
  resourceId: string
  collections: any[]
  onChange: (next: { linkType: 'custom' | 'collection'; url: string; resourceId: string }) => void
}) {
  return (
    <>
      <div className={styles.field}>
        <label>Link type</label>
        <select value={linkType} onChange={e => {
          const next = e.target.value as 'custom' | 'collection'
          onChange({ linkType: next, url, resourceId })
        }}>
          <option value="custom">Custom URL</option>
          <option value="collection">Collection</option>
        </select>
      </div>
      {linkType === 'collection' ? (
        <div className={styles.field}>
          <label>Collection</label>
          <select value={resourceId} onChange={e => {
            const c = collections.find(x => x.id === e.target.value)
            onChange({ linkType, resourceId: e.target.value, url: c ? `/collections/${c.slug}` : '' })
          }}>
            <option value="">Select collection</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : (
        <div className={styles.field}>
          <label>URL</label>
          <input value={url} onChange={e => onChange({ linkType, url: e.target.value, resourceId })} placeholder="/collections/all" />
        </div>
      )}
    </>
  )
}

function LinkDrawer({ drawer, collections, groupNames, onClose, onSubmit, onDelete }: {
  drawer: { mode: 'add' | 'edit'; kind: LinkKind; parentId: string; item?: Item; requireGroup?: boolean; presetGroup?: string }
  collections: any[]
  groupNames: string[]
  onClose: () => void
  onSubmit: (draft: Draft) => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => (drawer.item ? draftFromItem(drawer.item) : { ...emptyDraft(), group: drawer.presetGroup || '' }))
  const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }))

  const titles: Record<LinkKind, string> = { tile: 'Image tile', link: 'Link', sublink: 'Sub-link' }
  const canSubmit = draft.label.trim().length > 0
    && (drawer.kind !== 'tile' || !!draft.imageUrl)
    && (!drawer.requireGroup || draft.group.trim().length > 0)

  return (
    <div className={styles.drawer} onMouseDown={e => e.stopPropagation()}>
      <div className={styles.drawerHead}>
        <div>
          <div className={styles.eyebrow}>{drawer.mode === 'add' ? 'ADD' : 'EDIT'} · {titles[drawer.kind].toUpperCase()}</div>
          <h2 className={styles.drawerTitle}>{titles[drawer.kind]}</h2>
        </div>
        <button className={ui.iconBtn} onClick={onClose}><X size={17} /></button>
      </div>
      <div className={styles.drawerBody}>
        <div className={styles.field}>
          <label>Label</label>
          <input value={draft.label} onChange={e => set({ label: e.target.value })} placeholder="e.g. New In" autoFocus />
        </div>

        <DestinationFields
          linkType={draft.linkType}
          url={draft.url}
          resourceId={draft.resourceId}
          collections={collections}
          onChange={next => set(next)}
        />

        {drawer.kind === 'link' && (
          <div className={styles.field}>
            <label>Group heading {drawer.requireGroup ? '' : '(optional)'}</label>
            <input
              value={draft.group}
              onChange={e => set({ group: e.target.value })}
              placeholder="e.g. New In, Special Prices"
              list="nav-group-suggestions"
            />
            <datalist id="nav-group-suggestions">
              {groupNames.map(name => <option key={name} value={name} />)}
            </datalist>
            <small className={ui.muted}>Leave blank for a plain link. Type an existing heading to add this link to that group, or a new one to start a group.</small>
          </div>
        )}

        {drawer.kind === 'tile' && (
          <div className={styles.field}>
            <label>Image</label>
            <NavImageField value={draft.imageUrl} onChange={imageUrl => set({ imageUrl })} />
          </div>
        )}
      </div>
      <div className={styles.drawerFoot}>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose}>Cancel</button>
        <div className="inline">
          {onDelete && <button className={styles.removeBtn} onClick={() => { onDelete(); onClose() }}>Remove</button>}
          <button className={ui.btn} onClick={() => onSubmit(draft)} disabled={!canSubmit}>{drawer.mode === 'add' ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function NavImageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.navImageField}>
      {value ? (
        <div className={styles.navImagePreview}>
          <img src={value} alt="" />
          <div className={styles.navImageActions}>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setOpen(true)}>Change</button>
            <button type="button" className={ui.iconBtn} onClick={() => onChange('')} aria-label="Remove image"><X size={13} /></button>
          </div>
        </div>
      ) : (
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setOpen(true)}><ImagePlus size={15} /> Upload image</button>
      )}
      <MediaPicker open={open} onClose={() => setOpen(false)} onAdd={images => { if (images[0]) onChange(images[0].url); setOpen(false) }} />
    </div>
  )
}
