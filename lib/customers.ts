// MongoDB has no native FK support, so scripts/prepare-mongodb-schema.mjs forces every
// @relation's onDelete to NoAction in the schema actually used at runtime, regardless of
// what prisma/schema.prisma declares -- deleting a User while any of these still reference
// it would throw a referential-integrity error instead of cascading/nulling. Clean up
// manually first, matching this schema's intended Cascade/SetNull semantics. Shared by the
// single-customer, bulk-delete and staff-delete routes so the cleanup list can't drift.
//
// Not run inside db.$transaction: through Prisma Accelerate every query is a network round
// trip, and an interactive transaction is cancelled after 5 seconds -- these 13 steps one by
// one went past that on the live store and the delete failed ("Transaction already closed").
// The clean-ups run side by side instead and the account is removed last; each step is safe
// to repeat, so if anything fails, deleting again finishes the job.
export async function deleteCustomerCascade(client: any, id: string) {
  await Promise.all([
    client.address.deleteMany({ where: { userId: id } }),
    client.review.deleteMany({ where: { userId: id } }),
    client.wishlistItem.deleteMany({ where: { userId: id } }),
    client.orderNote.deleteMany({ where: { userId: id } }),
    client.notification.deleteMany({ where: { userId: id } }),
    client.passwordResetToken.deleteMany({ where: { userId: id } }),
    client.walletTransaction.deleteMany({ where: { userId: id } }),
    client.coinTransaction.deleteMany({ where: { userId: id } }),
    client.customerTagMember.deleteMany({ where: { customerId: id } }),
    client.customerSegmentMember.deleteMany({ where: { customerId: id } }),
    client.order.updateMany({ where: { userId: id }, data: { userId: null } }),
    client.auditLog.updateMany({ where: { actorId: id }, data: { actorId: null } }),
  ])
  await client.user.delete({ where: { id } })
}

// Removing a staff account for good. Their order notes are kept (re-attributed to whoever
// removes them, marked with the original author) and audit history keeps the actions with
// no actor, so nothing about past orders is lost.
export async function deleteStaffCascade(client: any, id: string, removedBy: string, name: string) {
  const notes = await client.orderNote.findMany({ where: { userId: id }, select: { id: true, body: true } })
  await Promise.all(notes.map((note: { id: string; body: string }) => client.orderNote.update({ where: { id: note.id }, data: { userId: removedBy, body: `[${name}] ${note.body}`.slice(0, 5000) } })))
  await deleteCustomerCascade(client, id)
}
