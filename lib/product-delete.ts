// Removes one product and every row that hangs off it. Used by the single-product delete and the
// bulk delete on the products list. Callers must check for past orders first: a product that
// appears in an order is archived instead, so the order history stays intact.
export async function deleteProductCascade(client: any, product: { id: string; inventory: { id: string; quantity: number }[] }) {
  const id = product.id
  await client.$transaction(async (tx: any) => {
    // No hard foreign keys under MongoDB, so every dependent collection is cleared explicitly
    // (same manual-cascade approach the variant-removal code in the product editor uses) rather
    // than relying on Prisma's declared onDelete: Cascade, which MongoDB doesn't enforce.
    for (const inv of product.inventory) if (inv.quantity > 0) await tx.inventoryMovement.create({ data: { inventoryId: inv.id, type: 'ADJUSTMENT', quantity: -inv.quantity, reason: 'Product deleted', referenceId: id } })
    await tx.inventoryItem.deleteMany({ where: { productId: id } })
    await tx.productImage.deleteMany({ where: { productId: id } })
    await tx.productVariant.deleteMany({ where: { productId: id } })
    await tx.productTag.deleteMany({ where: { productId: id } })
    await tx.metafieldValue.deleteMany({ where: { ownerType: 'PRODUCT', ownerId: id } })
    await tx.collectionProduct.deleteMany({ where: { productId: id } })
    await tx.review.deleteMany({ where: { productId: id } })
    await tx.wishlistItem.deleteMany({ where: { productId: id } })
    await tx.product.delete({ where: { id } })
  })
}
