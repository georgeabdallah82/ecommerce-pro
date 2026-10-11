import test from 'node:test'
import assert from 'node:assert/strict'
import {
  childrenOf, collectionFor, depthOf, describeMenuItem, headingGroups, headingsUnder, moveHeading, moveMenuItem, normalizeMenu, removeMenuItem, renameHeading,
  type MenuItem,
} from '../lib/menu-editor'

const menu: MenuItem[] = [
  { id: 'kitchen', label: 'Kitchenware', url: '#', parentId: null },
  { id: 'cups', label: 'Cups', type: 'collection', resourceId: 'c1', url: '/collections/cups', parentId: 'kitchen', group: 'Drink' },
  { id: 'tile1', label: 'New in', url: '/collections/new', parentId: 'kitchen', imageUrl: '/a.jpg' },
  { id: 'plates', label: 'Plates', url: '/collections/plates', parentId: 'kitchen' },
  { id: 'tile2', label: 'Sale', url: '/collections/sale', parentId: 'kitchen', imageUrl: '/b.jpg' },
  { id: 'mugs', label: 'Mugs', url: '/collections/mugs', parentId: 'cups' },
  { id: 'about', label: 'About us', url: '/pages/about', parentId: null },
  { id: 'contact', label: 'Contact', url: '/pages/contact', parentId: null },
]
const ids = (items: MenuItem[]) => items.map(item => item.id)

test('↑ / ↓ swaps an item with its neighbour, and the store reads that new order', () => {
  const down = moveMenuItem(menu, 'about', 1)
  assert.deepEqual(ids(childrenOf(down, null)), ['kitchen', 'contact', 'about'])
  const up = moveMenuItem(menu, 'about', -1)
  assert.deepEqual(ids(childrenOf(up, null)), ['about', 'kitchen', 'contact'])
  // Links under Kitchenware keep their own order.
  assert.deepEqual(ids(childrenOf(up, 'kitchen')), ids(childrenOf(menu, 'kitchen')))
})

test('the first item cannot go up and the last cannot go down', () => {
  assert.equal(moveMenuItem(menu, 'kitchen', -1), menu)
  assert.equal(moveMenuItem(menu, 'contact', 1), menu)
  assert.equal(moveMenuItem(menu, 'missing', 1), menu)
})

test('in a dropdown, links move among the links under the same heading, and pictures among pictures', () => {
  const kitchen: MenuItem[] = [
    { id: 'kitchen', label: 'Kitchenware', url: '#', parentId: null },
    { id: 'cups', label: 'Cups', parentId: 'kitchen', group: 'Drink' },
    { id: 'tile1', label: 'New in', parentId: 'kitchen', imageUrl: '/a.jpg' },
    { id: 'plates', label: 'Plates', parentId: 'kitchen' },
    { id: 'jugs', label: 'Jugs', parentId: 'kitchen', group: 'Drink ' },
    { id: 'tile2', label: 'Sale', parentId: 'kitchen', imageUrl: '/b.jpg' },
    { id: 'bowls', label: 'Bowls', parentId: 'kitchen' },
  ]
  const under = (items: MenuItem[]) => ids(childrenOf(items, 'kitchen'))
  // Cups' neighbour is Jugs (same heading), not the picture or Plates between them in the list.
  assert.deepEqual(under(moveMenuItem(kitchen, 'cups', 1)), ['jugs', 'tile1', 'plates', 'cups', 'tile2', 'bowls'])
  assert.deepEqual(under(moveMenuItem(kitchen, 'bowls', -1)), ['cups', 'tile1', 'bowls', 'jugs', 'tile2', 'plates'])
  assert.deepEqual(under(moveMenuItem(kitchen, 'tile2', -1)), ['cups', 'tile2', 'plates', 'jugs', 'tile1', 'bowls'])
  // Plates is the first link without a heading, Jugs the last one under Drink.
  assert.equal(moveMenuItem(kitchen, 'plates', -1), kitchen)
  assert.equal(moveMenuItem(kitchen, 'jugs', 1), kitchen)
  // Below a dropdown link the store ignores headings, so neither does ↑ / ↓.
  const deeper: MenuItem[] = [...kitchen, { id: 'mugs', label: 'Mugs', parentId: 'cups', group: 'A' }, { id: 'glasses', label: 'Glasses', parentId: 'cups' }]
  assert.deepEqual(ids(childrenOf(moveMenuItem(deeper, 'glasses', -1), 'cups')), ['glasses', 'mugs'])
  assert.equal(moveMenuItem(menu, 'mugs', -1), menu, 'Mugs is the only link under Cups')
})

test('with the Deals Market design, links move in plain list order, headings and pictures included', () => {
  const kitchen: MenuItem[] = [
    { id: 'kitchen', label: 'Kitchenware', url: '#', parentId: null },
    { id: 'cups', label: 'Cups', parentId: 'kitchen', group: 'Drink' },
    { id: 'tile', label: 'New in', parentId: 'kitchen', imageUrl: '/a.jpg' },
    { id: 'plates', label: 'Plates', parentId: 'kitchen' },
  ]
  const under = (items: MenuItem[]) => ids(childrenOf(items, 'kitchen'))
  assert.deepEqual(under(moveMenuItem(kitchen, 'cups', 1, false)), ['tile', 'cups', 'plates'])
  assert.deepEqual(under(moveMenuItem(kitchen, 'plates', -1, false)), ['cups', 'plates', 'tile'])
  assert.equal(moveMenuItem(kitchen, 'cups', -1, false), kitchen)
})

test('a dropdown is listed heading by heading, like the store shows it', () => {
  const items: MenuItem[] = [
    { id: 'kitchen', label: 'Kitchenware', parentId: null },
    { id: 'plates', label: 'Plates', parentId: 'kitchen' },
    { id: 'cups', label: 'Cups', parentId: 'kitchen', group: 'Drink' },
    { id: 'tile', label: 'Tile', parentId: 'kitchen', imageUrl: '/a.jpg', group: 'Drink' },
    { id: 'pans', label: 'Pans', parentId: 'kitchen', group: 'Cook' },
    { id: 'jugs', label: 'Jugs', parentId: 'kitchen', group: ' Drink' },
  ]
  const { groups, ungrouped } = headingGroups(items, 'kitchen')
  assert.deepEqual(groups.map(g => [g.name, ids(g.items)]), [['Drink', ['cups', 'jugs']], ['Cook', ['pans']]])
  assert.deepEqual(ids(ungrouped), ['plates'])

  // Moving Cook up puts its links before Drink's, without touching the others' places.
  const moved = moveHeading(items, 'kitchen', 'Cook', -1)
  assert.deepEqual(headingGroups(moved, 'kitchen').groups.map(g => [g.name, ids(g.items)]), [['Cook', ['pans']], ['Drink', ['cups', 'jugs']]])
  assert.deepEqual(ids(moved), ['kitchen', 'plates', 'pans', 'tile', 'cups', 'jugs'])
  assert.equal(moveHeading(items, 'kitchen', 'Drink', -1), items)
  assert.equal(moveHeading(items, 'kitchen', 'Cook', 1), items)
  assert.equal(moveHeading(items, 'kitchen', 'Missing', 1), items)

  const renamed = renameHeading(items, 'kitchen', 'Drink', '  Drinks ')
  assert.deepEqual(renamed.map(x => x.group ?? null), [null, null, 'Drinks', 'Drink', 'Cook', 'Drinks'], 'the picture keeps its own field')
})

test('deleting an item deletes the links under it, and nothing else', () => {
  assert.deepEqual(ids(removeMenuItem(menu, 'kitchen')), ['about', 'contact'])
  assert.deepEqual(ids(removeMenuItem(menu, 'cups')), ['kitchen', 'tile1', 'plates', 'tile2', 'about', 'contact'])
  assert.deepEqual(ids(removeMenuItem(menu, 'mugs')), ['kitchen', 'cups', 'tile1', 'plates', 'tile2', 'about', 'contact'])
})

test('loading the menu keeps orphans on the top row and treats empty pictures as links', () => {
  const loaded = normalizeMenu([
    { id: 'a', label: 'A', parentId: 'gone' },
    { id: 'b', label: 'B', parentId: 'a', imageUrl: '' },
    { id: 'c', label: 'C', parentId: 'a', imageUrl: '/c.jpg' },
  ])
  assert.equal(loaded[0].parentId, null)
  assert.equal(loaded[1].parentId, 'a')
  assert.equal(loaded[1].imageUrl, null, 'the store shows an empty picture as a plain link')
  assert.equal(loaded[2].imageUrl, '/c.jpg')
  assert.equal(depthOf(menu, 'mugs'), 2)
  assert.equal(depthOf(menu, 'kitchen'), 0)
})

test('each item says in plain words where it goes', () => {
  const collections = [{ id: 'c1', name: 'Cups & mugs' }]
  assert.equal(describeMenuItem(menu[1], collections, 1), 'Collection: Cups & mugs')
  assert.equal(describeMenuItem({ id: 'x', label: 'X', type: 'collection', resourceId: null }, collections, 0), 'Collection: not chosen yet')
  assert.equal(describeMenuItem(menu[0], collections, 3), 'Opens a dropdown')
  assert.equal(describeMenuItem({ id: 'x', label: 'X', url: '#' }, collections, 0), 'Goes nowhere yet')
  assert.equal(describeMenuItem(menu[6], collections, 0), '/pages/about')
  // A collection link whose collection isn't recorded is recognised from its address, or shows it.
  const withSlug = [{ id: 'c2', name: 'Home goods', slug: 'home-goods' }]
  assert.equal(describeMenuItem({ id: 'k', label: 'K', type: 'collection', resourceId: null, url: '/collections/home-goods' }, withSlug, 0), 'Collection: Home goods')
  assert.equal(describeMenuItem({ id: 'k', label: 'K', type: 'collection', resourceId: 'gone', url: '/collections/old' }, withSlug, 0), '/collections/old')
})

test('the collection picker shows the collection a link points to', () => {
  const collections = [{ id: 'c1', name: 'Cups', slug: 'cups' }, { id: 'c2', name: 'Home goods', slug: 'home-goods' }]
  assert.equal(collectionFor({ id: 'x', label: 'X', resourceId: 'c1', url: '/collections/home-goods' }, collections)?.id, 'c1')
  assert.equal(collectionFor({ id: 'x', label: 'X', resourceId: null, url: '/collections/home-goods' }, collections)?.id, 'c2')
  assert.equal(collectionFor({ id: 'x', label: 'X', resourceId: null, url: '/collections/home-goods-2' }, collections), undefined)
})

test('heading suggestions come from the headings already used under the same item', () => {
  const items = [...menu, { id: 'bowls', label: 'Bowls', parentId: 'kitchen', group: ' Eat ' }, { id: 'jugs', label: 'Jugs', parentId: 'kitchen', group: 'Drink' }]
  assert.deepEqual(headingsUnder(items, 'kitchen'), ['Drink', 'Eat'])
  assert.deepEqual(headingsUnder(items, null), [])
})
