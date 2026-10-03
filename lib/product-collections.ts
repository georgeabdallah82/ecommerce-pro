// Puts a product into exactly the given collections, from the product editor. Collections it
// stays in keep their position; collections it joins get it at the end of their list.
// Unknown collection ids are ignored. `client` is db or a transaction client.
export async function setProductCollections(client: any, productId: string, ids: unknown) {
  if (!Array.isArray(ids)) return
  const wanted = Array.from(new Set(ids.map(x => String(x || '').trim()).filter(Boolean))).slice(0, 200)
  const valid = wanted.length ? await client.collection.findMany({ where: { id: { in: wanted } }, select: { id: true } }) : []
  const validIds = wanted.filter(id => valid.some((c: { id: string }) => c.id === id))

  const product = await client.product.findUnique({ where: { id: productId }, include: { collections: true } })
  const current: { collectionId: string; sortOrder: number }[] = product?.collections || []
  const kept = new Map(current.map(row => [row.collectionId, row.sortOrder]))
  if (validIds.length === current.length && validIds.every(id => kept.has(id))) return

  const rows: { collectionId: string; productId: string; sortOrder: number }[] = []
  for (const collectionId of validIds) {
    let sortOrder = kept.get(collectionId)
    if (sortOrder === undefined) {
      const collection = await client.collection.findUnique({ where: { id: collectionId }, include: { products: true } })
      const orders: number[] = (collection?.products || []).map((p: { sortOrder: number }) => Number(p.sortOrder) || 0)
      sortOrder = orders.length ? Math.max(...orders) + 1 : 0
    }
    rows.push({ collectionId, productId, sortOrder })
  }
  await client.collectionProduct.deleteMany({ where: { productId } })
  if (rows.length) await client.collectionProduct.createMany({ data: rows })
}
