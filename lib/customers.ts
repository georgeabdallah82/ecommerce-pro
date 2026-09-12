// MongoDB has no native FK support, so scripts/prepare-mongodb-schema.mjs forces every
// @relation's onDelete to NoAction in the schema actually used at runtime, regardless of
// what prisma/schema.prisma declares -- deleting a User while any of these still reference
// it would throw a referential-integrity error instead of cascading/nulling. Clean up
// manually first, matching this schema's intended Cascade/SetNull semantics. Shared by the
// single-customer and bulk-delete routes so the cleanup list can't drift out of sync.
export async function deleteCustomerCascade(tx: any, id: string) {
  await tx.address.deleteMany({ where: { userId: id } })
  await tx.review.deleteMany({ where: { userId: id } })
  await tx.wishlistItem.deleteMany({ where: { userId: id } })
  await tx.orderNote.deleteMany({ where: { userId: id } })
  await tx.notification.deleteMany({ where: { userId: id } })
  await tx.passwordResetToken.deleteMany({ where: { userId: id } })
  await tx.walletTransaction.deleteMany({ where: { userId: id } })
  await tx.coinTransaction.deleteMany({ where: { userId: id } })
  await tx.customerTagMember.deleteMany({ where: { customerId: id } })
  await tx.customerSegmentMember.deleteMany({ where: { customerId: id } })
  await tx.order.updateMany({ where: { userId: id }, data: { userId: null } })
  await tx.auditLog.updateMany({ where: { actorId: id }, data: { actorId: null } })
  await tx.user.delete({ where: { id } })
}
