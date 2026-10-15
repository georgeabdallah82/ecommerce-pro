'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, ImagePlus, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import {
  MAX_MENU_DEPTH, childrenOf, collectionFor, describeMenuItem, descendantIds, headingGroups, headingsUnder, isPicture, moveHeading, moveMenuItem, normalizeMenu,
  removeMenuItem, renameHeading, siblingsOf, type MenuItem,
} from '@/lib/menu-editor'
import { useConfirm } from './admin-confirm'
import styles from './admin-navigation-editor.module.css'
import ui from './admin-ui.module.css'
import MediaPicker from './media-picker'
import ThemePublishBar from './theme-publish-bar'

type Collection = { id: string; name: string; slug: string }
// grouped: the store design shows dropdown links by heading with pictures as tiles (false for the
// Deals Market design, which shows them in plain order; see lib/menu-editor.ts).
type Props = { initial: MenuItem[]; collections: Collection[]; initialDraft: boolean; grouped?: boolean }

const newId = () => `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Admin > Online Store > Navigation: the store's top menu as one list. Each item has ↑ / ↓ to
// change its place, opens to show the links under it (by heading, as the store's dropdown shows
// them), and is edited right where it is. The data is the same flat list the store reads
// (lib/menu-editor.ts); Save writes it to the theme draft and Publish puts it live, like the theme
// editor.
export default function NavigationEditorPro({ initial, collections, initialDraft, grouped = true }: Props) {
  const confirm = useConfirm()
  const [items, setItems] = useState<MenuItem[]>(() => normalizeMenu(initial || []))
  const savedJson = useRef(JSON.stringify(normalizeMenu(initial || [])))
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(initialDraft)
  const [publishing, setPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishError, setPublishError] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  // The item being edited, and how it was before (null: it was just added, Cancel removes it).
  const [editing, setEditing] = useState<{ id: string; before: MenuItem | null } | null>(null)

  const dirty = useMemo(() => JSON.stringify(items) !== savedJson.current, [items])
  const roots = childrenOf(items, null)

  const patch = (id: string, data: Partial<MenuItem>) => setItems(cur => cur.map(x => (x.id === id ? { ...x, ...data } : x)))
  const toggle = (id: string) => setOpen(cur => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next })

  function startEdit(item: MenuItem) {
    if (editing && editing.id !== item.id) finishEdit()
    setEditing({ id: item.id, before: { ...item } })
  }
  function finishEdit() {
    if (!editing) return
    setItems(cur => cur.map(x => (x.id === editing.id && !x.label.trim() ? { ...x, label: 'Untitled' } : x)))
    setEditing(null)
  }
  function cancelEdit() {
    if (!editing) return
    const { id, before } = editing
    setItems(cur => (before ? cur.map(x => (x.id === id ? before : x)) : removeMenuItem(cur, id)))
    setEditing(null)
  }

  function add(parentId: string | null, picture = false, group: string | null = null) {
    if (editing) finishEdit()
    const item: MenuItem = picture
      ? { id: newId(), label: '', type: 'collection', url: '', parentId, resourceId: null, imageUrl: '' }
      : { id: newId(), label: '', type: parentId ? 'collection' : 'custom', url: parentId ? '' : '#', parentId, resourceId: null, group }
    setItems(cur => [...cur, item])
    if (parentId) setOpen(cur => new Set(cur).add(parentId))
    setEditing({ id: item.id, before: null })
  }

  async function remove(item: MenuItem) {
    const under = descendantIds(items, item.id).size
    const ok = await confirm({
      title: `Delete “${item.label || 'this item'}”?`,
      message: under ? `The ${under} link${under === 1 ? '' : 's'} under it will be deleted too. Nothing changes on your store until you Save and Publish.` : 'Nothing changes on your store until you Save and Publish.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    if (editing?.id === item.id) setEditing(null)
    setItems(cur => removeMenuItem(cur, item.id))
  }

  async function save() {
    if (editing) finishEdit()
    setSaving(true)
    setNotice('')
    setError('')
    try {
      // A picture whose image was never chosen isn't saved (the store would show it as an empty link).
      const current = items
        .filter(x => !(isPicture(x) && !x.imageUrl))
        .map(x => (x.label.trim() ? x : { ...x, label: 'Untitled' }))
      const theme = await (await fetch('/api/admin/theme', { cache: 'no-store' })).json()
      if (theme?.error) throw new Error(theme.error)
      const response = await fetch('/api/admin/theme', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...theme, navigation: current }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save the menu')
      savedJson.current = JSON.stringify(current)
      setItems(current)
      setHasDraft(true)
      setNotice('Saved. Tap Publish (bottom right) to show it on your store.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the menu')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    if (!hasDraft || publishing) return
    setPublishing(true)
    setPublishMessage('')
    setPublishError('')
    try {
      const response = await fetch('/api/admin/theme/publish', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to publish the menu')
      setHasDraft(false)
      setNotice('')
      setPublishMessage('Published: your store shows the new menu')
      window.setTimeout(() => setPublishMessage(''), 3000)
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Unable to publish the menu')
      window.setTimeout(() => setPublishError(''), 4000)
    } finally {
      setPublishing(false)
    }
  }

  const rowProps = {
    items, collections, grouped, open, editing, toggle, startEdit, finishEdit, cancelEdit, add, remove, patch,
    move: (id: string, d: -1 | 1) => setItems(cur => moveMenuItem(cur, id, d, grouped)),
    moveHeading: (parentId: string, name: string, d: -1 | 1) => setItems(cur => moveHeading(cur, parentId, name, d)),
    renameHeading: (parentId: string, from: string, to: string) => setItems(cur => renameHeading(cur, parentId, from, to)),
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>ONLINE STORE</div>
          <h1>Menu</h1>
          <p className={ui.muted}>The links at the top of your store. Use the arrows to change the order, tap an item to see the links under it, and Edit to change where it goes.</p>
        </div>
        <div className={styles.headerActions}>
          {dirty && <span className={styles.unsaved}>Unsaved changes</span>}
          <button className={ui.btn} onClick={save} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {(notice || error) && <div className={`${ui.alert} ${styles.alertSpacing} ${error ? ui.alertDanger : ''}`}>{error || notice}</div>}

      <section className={`${ui.card} ${styles.menuCard}`}>
        {roots.length === 0 && (
          <div className={styles.empty}>
            <strong>Your menu is empty</strong>
            <span>Add the first item, e.g. “Kitchenware” or “About us”.</span>
          </div>
        )}
        <ol className={styles.list}>
          {roots.map(root => <MenuRow key={root.id} item={root} depth={0} {...rowProps} />)}
        </ol>
        <button className={styles.addTop} onClick={() => add(null)}><Plus size={16} /> Add menu item</button>
      </section>

      <p className={styles.footnote}>Changes show on your store after <strong>Save</strong> and then <strong>Publish</strong>.{' '}<a className={ui.textLink} href="/" target="_blank" rel="noreferrer">View store <ExternalLink size={12} /></a></p>

      <ThemePublishBar draft={hasDraft} publishing={publishing} message={publishMessage} error={publishError} onPublish={publish} />
    </div>
  )
}

type RowProps = {
  item: MenuItem
  depth: number
  items: MenuItem[]
  collections: Collection[]
  grouped: boolean
  open: Set<string>
  editing: { id: string; before: MenuItem | null } | null
  toggle: (id: string) => void
  startEdit: (item: MenuItem) => void
  finishEdit: () => void
  cancelEdit: () => void
  add: (parentId: string | null, picture?: boolean, group?: string | null) => void
  remove: (item: MenuItem) => void
  patch: (id: string, data: Partial<MenuItem>) => void
  move: (id: string, direction: -1 | 1) => void
  moveHeading: (parentId: string, name: string, direction: -1 | 1) => void
  renameHeading: (parentId: string, from: string, to: string) => void
}

function MenuRow(props: RowProps) {
  const { item, depth, items, collections, grouped, open, editing, toggle, startEdit, finishEdit, cancelEdit, add, remove, patch, move } = props
  const kids = childrenOf(items, item.id)
  // Grouped design: a top-level item's dropdown shows its picture tiles, then its links heading by
  // heading. Otherwise (and below the dropdown) the links are one plain list, pictures included.
  const tiles = grouped ? kids.filter(isPicture) : []
  const links = grouped ? kids.filter(k => !isPicture(k)) : kids
  const { groups, ungrouped } = grouped && depth === 0 ? headingGroups(items, item.id) : { groups: [], ungrouped: links }
  const row = (child: MenuItem) => <MenuRow key={child.id} {...props} item={child} depth={depth + 1} />
  const siblings = siblingsOf(items, item, grouped)
  const index = siblings.findIndex(s => s.id === item.id)
  const picture = isPicture(item)
  // A grouped design's picture tile is a single link; anything else can have links under it.
  const tile = grouped && picture
  const canNest = depth < MAX_MENU_DEPTH - 1 && !tile
  const isOpen = open.has(item.id)
  const isEditing = editing?.id === item.id
  const label = item.label.trim() || (tile ? 'New picture' : 'New item')

  return (
    <li className={`${styles.item} ${depth ? styles.child : ''}`}>
      <div className={`${styles.row} ${isEditing ? styles.rowEditing : ''}`}>
        <div className={styles.arrows}>
          <button type="button" aria-label={`Move “${label}” up`} disabled={index <= 0} onClick={() => move(item.id, -1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label={`Move “${label}” down`} disabled={index === -1 || index >= siblings.length - 1} onClick={() => move(item.id, 1)}><ArrowDown size={16} /></button>
        </div>
        {picture && <span className={styles.thumb} style={item.imageUrl ? { backgroundImage: `url(${JSON.stringify(item.imageUrl)})` } : undefined} aria-hidden="true" />}
        <button type="button" className={styles.main} onClick={() => (canNest ? toggle(item.id) : startEdit(item))} aria-expanded={canNest ? isOpen : undefined}>
          {canNest && (isOpen ? <ChevronDown size={16} className={styles.chevron} /> : <ChevronRight size={16} className={styles.chevron} />)}
          <span className={styles.text}>
            <strong>{label}</strong>
            <small>
              {tile ? 'Picture at the top of the dropdown' : describeMenuItem(item, collections, kids.length)}
              {canNest && links.length > 0 ? <span className={styles.count}>{links.length} link{links.length === 1 ? '' : 's'} inside</span> : null}
              {canNest && tiles.length > 0 ? <span className={styles.count}>{tiles.length} picture{tiles.length === 1 ? '' : 's'}</span> : null}
            </small>
          </span>
        </button>
        <div className={styles.rowActions}>
          <button type="button" className={styles.iconBtn} onClick={() => (isEditing ? finishEdit() : startEdit(item))} aria-label={`Edit “${label}”`}><Pencil size={15} /><span>Edit</span></button>
          <button type="button" className={`${styles.iconBtn} ${styles.danger}`} onClick={() => remove(item)} aria-label={`Delete “${label}”`}><Trash2 size={15} /></button>
        </div>
      </div>

      {isEditing && (
        <EditForm
          item={item}
          depth={depth}
          grouped={grouped}
          collections={collections}
          headings={headingsUnder(items, item.parentId ?? null)}
          hasChildren={kids.length > 0}
          isNew={!editing?.before}
          onChange={data => patch(item.id, data)}
          onDone={finishEdit}
          onCancel={cancelEdit}
        />
      )}

      {canNest && isOpen && (
        <div className={styles.children}>
          {tiles.length > 0 && <ol className={styles.list}>{tiles.map(row)}</ol>}
          {groups.map((group, i) => (
            <HeadingSection
              key={group.name}
              name={group.name}
              first={i === 0}
              last={i === groups.length - 1}
              onMove={d => props.moveHeading(item.id, group.name, d)}
              onRename={to => props.renameHeading(item.id, group.name, to)}
              onAdd={() => add(item.id, false, group.name)}
            >
              <ol className={styles.list}>{group.items.map(row)}</ol>
            </HeadingSection>
          ))}
          {ungrouped.length > 0 && (
            groups.length > 0 ? (
              <section className={styles.group}>
                <div className={`${styles.groupHead} ${styles.groupHeadPlain}`}><span className={styles.groupTitle}><small>Links without a heading</small></span></div>
                <ol className={styles.list}>{ungrouped.map(row)}</ol>
              </section>
            ) : <ol className={styles.list}>{ungrouped.map(row)}</ol>
          )}
          {kids.length === 0 && <p className={styles.childEmpty}>No links under “{label}” yet.</p>}
          <div className={styles.addRow}>
            <button type="button" className={styles.addChild} onClick={() => add(item.id)}><Plus size={15} /> Add link under “{label}”</button>
            {grouped && depth === 0 && <button type="button" className={styles.addChild} onClick={() => add(item.id, true)}><ImagePlus size={15} /> Add picture</button>}
          </div>
        </div>
      )}
    </li>
  )
}

// One heading in a dropdown: its name, ↑ / ↓ to move it with all its links, and Rename.
function HeadingSection({ name, first, last, onMove, onRename, onAdd, children }: {
  name: string
  first: boolean
  last: boolean
  onMove: (direction: -1 | 1) => void
  onRename: (to: string) => void
  onAdd: () => void
  children: ReactNode
}) {
  const [renaming, setRenaming] = useState(false)
  const [value, setValue] = useState(name)
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <div className={styles.arrows}>
          <button type="button" aria-label={`Move heading “${name}” up`} disabled={first} onClick={() => onMove(-1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label={`Move heading “${name}” down`} disabled={last} onClick={() => onMove(1)}><ArrowDown size={16} /></button>
        </div>
        {renaming ? (
          <form className={styles.rename} onSubmit={e => { e.preventDefault(); if (value.trim()) { onRename(value); setRenaming(false) } }}>
            <input autoFocus value={value} onChange={e => setValue(e.target.value)} aria-label="Heading name" />
            <button type="submit" className={ui.btn} disabled={!value.trim()}>Done</button>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setRenaming(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <span className={styles.groupTitle}><small>Heading</small><strong>{name}</strong></span>
            <button type="button" className={styles.iconBtn} onClick={() => { setValue(name); setRenaming(true) }} aria-label={`Rename heading “${name}”`}><Pencil size={15} /><span>Rename</span></button>
          </>
        )}
      </div>
      {children}
      <div className={styles.addRow}>
        <button type="button" className={styles.addChild} onClick={onAdd}><Plus size={15} /> Add link under “{name}”</button>
      </div>
    </section>
  )
}

function EditForm({ item, depth, grouped, collections, headings, hasChildren, isNew, onChange, onDone, onCancel }: {
  item: MenuItem
  depth: number
  grouped: boolean
  collections: Collection[]
  headings: string[]
  hasChildren: boolean
  isNew: boolean
  onChange: (data: Partial<MenuItem>) => void
  onDone: () => void
  onCancel: () => void
}) {
  const tile = grouped && isPicture(item)
  const target = item.type === 'collection' ? 'collection' : (!item.url || item.url === '#') && depth === 0 ? 'none' : 'custom'
  const [showMore, setShowMore] = useState(!!item.group?.trim())
  const listId = `menu-headings-${item.id}`

  function setTarget(next: string) {
    if (next === 'collection') onChange({ type: 'collection', url: '', resourceId: null })
    else if (next === 'none') onChange({ type: 'custom', url: '#', resourceId: null })
    else onChange({ type: 'custom', url: item.url && item.url !== '#' ? item.url : '', resourceId: null })
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span>Name</span>
        <input autoFocus value={item.label} onChange={e => onChange({ label: e.target.value })} placeholder={depth === 0 ? 'e.g. Kitchenware' : 'e.g. Tupperware'} />
      </label>
      <label className={styles.field}>
        <span>Name in Arabic <small>(optional, for the Arabic version of the store)</small></span>
        <input dir="rtl" lang="ar" value={item.labelAr || ''} onChange={e => onChange({ labelAr: e.target.value || null })} placeholder={item.label || ''} />
      </label>

      {tile && (
        <div className={styles.field}>
          <span>Picture</span>
          <NavImageField value={item.imageUrl || ''} onChange={imageUrl => onChange({ imageUrl })} />
        </div>
      )}
      {/* Deals Market: a link in a dropdown can show a small picture next to its name. */}
      {!grouped && depth === 1 && (
        <div className={styles.field}>
          <span>Picture (optional)</span>
          <NavImageField value={item.imageUrl || ''} onChange={imageUrl => onChange({ imageUrl })} onRemove={() => onChange({ imageUrl: null })} />
        </div>
      )}

      <label className={styles.field}>
        <span>When tapped, it opens</span>
        <select value={target} onChange={e => setTarget(e.target.value)}>
          <option value="collection">A collection</option>
          <option value="custom">A page or web address</option>
          {depth === 0 && <option value="none">Nothing, it only opens its dropdown</option>}
        </select>
      </label>

      {target === 'collection' && (
        <label className={styles.field}>
          <span>Collection</span>
          <select value={collectionFor(item, collections)?.id || ''} onChange={e => {
            const c = collections.find(x => x.id === e.target.value)
            onChange({ resourceId: e.target.value || null, url: c ? `/collections/${c.slug}` : '' })
          }}>
            <option value="">Choose a collection</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {target === 'custom' && (
        <label className={styles.field}>
          <span>Page or web address</span>
          <input value={item.url || ''} onChange={e => onChange({ url: e.target.value })} placeholder="/pages/about-us or https://…" inputMode="url" />
        </label>
      )}
      {target === 'none' && !hasChildren && <p className={styles.hint}>Add links under it after Done, or it will open an empty dropdown.</p>}

      {grouped && depth === 1 && !tile && (
        showMore ? (
          <label className={styles.field}>
            <span>Heading (optional)</span>
            <input value={item.group || ''} onChange={e => onChange({ group: e.target.value || null })} placeholder="e.g. New in" list={listId} />
            <datalist id={listId}>{headings.map(h => <option key={h} value={h} />)}</datalist>
            <small>Links with the same heading are shown together, under that heading, in the dropdown.</small>
          </label>
        ) : (
          <button type="button" className={styles.more} onClick={() => setShowMore(true)}>+ Put it under a heading</button>
        )
      )}

      <div className={styles.formActions}>
        <button type="button" className={ui.btn} onClick={onDone} disabled={tile && !item.imageUrl}>Done</button>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onCancel}><X size={15} /> {isNew ? 'Remove' : 'Cancel'}</button>
      </div>
    </div>
  )
}

function NavImageField({ value, onChange, onRemove }: { value: string; onChange: (value: string) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.imageField}>
      {value ? <img src={value} alt="" /> : null}
      <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setOpen(true)}><ImagePlus size={15} /> {value ? 'Change picture' : 'Choose picture'}</button>
      {value && onRemove ? <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onRemove}><X size={15} /> Remove picture</button> : null}
      <MediaPicker open={open} onClose={() => setOpen(false)} onAdd={images => { if (images[0]) onChange(images[0].url); setOpen(false) }} />
    </div>
  )
}

