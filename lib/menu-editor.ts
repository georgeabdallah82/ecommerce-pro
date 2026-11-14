// The store menu as Admin > Online Store > Navigation edits it: a flat list where each item names
// its parent (null for the top row of the menu). The order of the list is the order on the store.
// How a top-level item's dropdown shows its links depends on the store design:
// - "grouped" (components/store-nav-fixed.tsx, DeptContent): pictures (imageUrl) as a row of tiles
//   first, then the links with a heading (group), heading by heading in the order each heading
//   first appears, then the links without one;
// - the Deals Market design (components/market-chrome.tsx): every link in list order, a picture
//   being a small image next to its link, and no headings.
// Pure functions, so the editor (components/navigation-editor-pro.tsx) and the tests share them.

// labelAr: the item's name on the Arabic version of the store (lib/i18n.ts), optional.
export type MenuItem = { id: string; label: string; labelAr?: string | null; url?: string | null; type?: string; parentId?: string | null; resourceId?: string | null; group?: string | null; imageUrl?: string | null }

// Top row, its links, and links under those: what the store's dropdown can show.
export const MAX_MENU_DEPTH = 3

export function childrenOf(items: MenuItem[], parentId: string | null): MenuItem[] {
  return items.filter(item => (item.parentId ?? null) === parentId)
}

// Items whose parent no longer exists move to the top row instead of disappearing. A saved item
// with an empty picture is a plain link on the store, so it is loaded as one (imageUrl null): '' only
// marks a picture tile that was just added and has no picture chosen yet.
export function normalizeMenu(items: MenuItem[]): MenuItem[] {
  const ids = new Set(items.map(item => item.id))
  return items.map(item => ({ ...item, parentId: item.parentId && ids.has(item.parentId) ? item.parentId : null, imageUrl: item.imageUrl || null }))
}

export function descendantIds(items: MenuItem[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (parent: string) => {
    for (const child of items) {
      if (child.parentId === parent && !out.has(child.id)) { out.add(child.id); walk(child.id) }
    }
  }
  walk(id)
  return out
}

export function removeMenuItem(items: MenuItem[], id: string): MenuItem[] {
  const gone = new Set([id, ...descendantIds(items, id)])
  return items.filter(item => !gone.has(item.id))
}

export function depthOf(items: MenuItem[], id: string): number {
  const byId = new Map(items.map(item => [item.id, item]))
  let depth = 0
  let current = byId.get(id)
  const seen = new Set<string>()
  while (current?.parentId && byId.has(current.parentId) && !seen.has(current.id)) {
    seen.add(current.id)
    current = byId.get(current.parentId)
    depth++
  }
  return depth
}

// A picture tile: has an imageUrl field, even while its picture isn't chosen yet ('').
export const isPicture = (item: MenuItem) => item.imageUrl != null

const headingOf = (item: MenuItem) => item.group?.trim() || ''

// Whether the store groups this item's links under headings: only a top-level item's dropdown does.
const groupsByHeading = (items: MenuItem[], parentId: string | null) =>
  parentId != null && items.some(item => item.id === parentId && !item.parentId)

// The items that ↑ / ↓ moves an item among, i.e. the ones it is shown next to on the store: same
// parent, and with the grouped design, pictures only among pictures (they show as their own row
// above the links) and, in a dropdown, links only among the links under the same heading.
export function siblingsOf(items: MenuItem[], item: MenuItem, grouped = true): MenuItem[] {
  const parentId = item.parentId ?? null
  if (!grouped) return childrenOf(items, parentId)
  const byHeading = groupsByHeading(items, parentId) && !isPicture(item)
  return childrenOf(items, parentId).filter(other => isPicture(other) === isPicture(item) && (!byHeading || headingOf(other) === headingOf(item)))
}

// A dropdown's links the way the store shows them: each heading with its links, then the rest.
export function headingGroups(items: MenuItem[], parentId: string): { groups: { name: string; items: MenuItem[] }[]; ungrouped: MenuItem[] } {
  const groups: { name: string; items: MenuItem[] }[] = []
  const ungrouped: MenuItem[] = []
  for (const child of childrenOf(items, parentId)) {
    if (isPicture(child)) continue
    const name = headingOf(child)
    if (!name) { ungrouped.push(child); continue }
    let group = groups.find(g => g.name === name)
    if (!group) groups.push(group = { name, items: [] })
    group.items.push(child)
  }
  return { groups, ungrouped }
}

// Moves a whole heading (with its links) before or after the heading next to it. A heading's place
// on the store is where its first link is in the list, so the links that have a heading are put
// back into the same slots, heading by heading in the new order.
export function moveHeading(items: MenuItem[], parentId: string, name: string, direction: -1 | 1): MenuItem[] {
  const { groups } = headingGroups(items, parentId)
  const index = groups.findIndex(g => g.name === name)
  const other = index + direction
  if (index < 0 || other < 0 || other >= groups.length) return items
  const order = groups.slice()
  ;[order[index], order[other]] = [order[other], order[index]]
  const queue = order.flatMap(g => g.items)
  const ids = new Set(queue.map(item => item.id))
  let next = 0
  return items.map(item => (ids.has(item.id) ? queue[next++] : item))
}

// Renames a heading on all the links under it (an empty name takes their heading away).
export function renameHeading(items: MenuItem[], parentId: string, from: string, to: string): MenuItem[] {
  const name = to.trim()
  return items.map(item => ((item.parentId ?? null) === parentId && !isPicture(item) && headingOf(item) === from ? { ...item, group: name || null } : item))
}

// Swaps the item with the one before (-1) or after (+1) it. The list's order is the store's order,
// so swapping their places in the list is all it takes.
export function moveMenuItem(items: MenuItem[], id: string, direction: -1 | 1, grouped = true): MenuItem[] {
  const item = items.find(x => x.id === id)
  if (!item) return items
  const siblings = siblingsOf(items, item, grouped)
  const index = siblings.findIndex(x => x.id === id)
  const other = siblings[index + direction]
  if (!other) return items
  const a = items.findIndex(x => x.id === id)
  const b = items.findIndex(x => x.id === other.id)
  const copy = items.slice()
  ;[copy[a], copy[b]] = [copy[b], copy[a]]
  return copy
}

type MenuCollection = { id: string; name: string; slug?: string }

// The collection a collection link opens: the one it was chosen from, or else the one its address
// points to (older items, and collections picked again after being deleted and re-made).
export function collectionFor<C extends MenuCollection>(item: MenuItem, collections: C[]): C | undefined {
  return collections.find(c => c.id === item.resourceId) || collections.find(c => c.slug && item.url === `/collections/${c.slug}`)
}

// The store's own pages a menu link can open (the app/ routes a visitor uses), for the editor's "A page on your store"
// choice, which also lists the store's custom pages (Admin > Online store > Pages, at /handle).
export const STORE_LINKS: Array<{ path: string; label: string }> = [
  { path: '/', label: 'Home page' },
  { path: '/shop', label: 'All products' },
  { path: '/collections', label: 'All collections' },
  { path: '/blog', label: 'Blog' },
  { path: '/track', label: 'Track an order' },
  { path: '/stores', label: 'Our stores' },
  { path: '/wholesale', label: 'Wholesale' },
  { path: '/wishlist', label: 'Wishlist' },
  { path: '/account', label: 'My account' },
  { path: '/cart', label: 'Cart' },
  { path: '/refund-policy', label: 'Refund policy' },
  { path: '/privacy-policy', label: 'Privacy policy' },
  { path: '/terms-of-service', label: 'Terms of service' },
]
export type StorePage = { title: string; handle: string; status: string }

// Every page a link can choose: the store's own, then its custom pages (a draft says so).
export function pageLinks(pages: StorePage[] = []): Array<{ path: string; label: string; custom: boolean }> {
  return [
    ...STORE_LINKS.map(link => ({ ...link, custom: false })),
    ...pages.map(page => ({ path: `/${page.handle}`, label: page.status === 'PUBLISHED' ? page.title : `${page.title} (draft)`, custom: true })),
  ]
}

// Why a link typed into the menu would let visitors down, or null.
// - "#about" or "/#about": the store's pages have no sections to jump to (only #main-content), so it opens the
//   top of the homepage; the store's first menu shipped with one.
// - "/pages/about-us": pages are at /about-us, so this shows "page not found" (the editor's example used it).
// - A custom page that is still a draft: "page not found" for visitors.
export function linkProblem(url: unknown, pages?: StorePage[]): string | null {
  const raw = String(url ?? '').trim()
  if (!raw || raw === '#' || /^(https?:|mailto:|tel:)/i.test(raw)) return null
  const anchor = raw.match(/^\/?#(.+)$/)
  if (anchor) return anchor[1] === 'main-content' ? null : `Opens the top of your homepage: there is no “#${anchor[1]}” section on it`
  const old = raw.match(/^\/pages\/([^/?#]+)/)
  if (old) return `Pages are at /${old[1]}, not /pages/${old[1]}: this address shows “page not found”`
  const handle = raw.match(/^\/([^/?#]+)\/?(?:[?#].*)?$/)?.[1]
  const page = handle && pages ? pages.find(p => p.handle === handle) : undefined
  if (page && page.status !== 'PUBLISHED') return `Goes to “${page.title}”, which is a draft: visitors see “page not found”`
  return null
}

// One line under each item's name saying where it goes (a page by its name when it is one of the store's).
export function describeMenuItem(item: MenuItem, collections: MenuCollection[], childCount: number, pages?: StorePage[]): string {
  const url = String(item.url || '').trim()
  if (item.type === 'collection') {
    const name = collectionFor(item, collections)?.name
    if (name) return `Collection: ${name}`
    if (!url || url === '#') return 'Collection: not chosen yet'
  }
  if (!url || url === '#') return childCount ? 'Opens a dropdown' : 'Goes nowhere yet'
  const page = pages ? pageLinks(pages).find(link => link.path === url) : undefined
  return page ? `Page: ${page.label}` : url
}

// Headings already used under the same parent, for the heading field's suggestions.
export function headingsUnder(items: MenuItem[], parentId: string | null): string[] {
  const names: string[] = []
  for (const child of childrenOf(items, parentId)) {
    const name = child.group?.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}
