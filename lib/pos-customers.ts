// Customers at the till use the same records as the online store: a customer is a user with the
// customer role. The till finds them and attaches them to a sale. It does not create accounts here,
// because a store account needs a password and a way to sign in.

import { Role } from '@prisma/client'
import { db } from '@/lib/prisma'

export type TillCustomer = { id: string; name: string; email: string; phone: string | null }

/** Customers whose name, email or phone contains every word typed. Staff accounts are never returned. */
export async function searchTillCustomers(query: string, limit = 8): Promise<TillCustomer[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5)
  if (words.length === 0) return []
  const rows = await db.user.findMany({
    where: {
      role: Role.CUSTOMER,
      AND: words.map(word => ({
        OR: [
          { name: { contains: word, mode: 'insensitive' } },
          { email: { contains: word, mode: 'insensitive' } },
          { phone: { contains: word } },
        ],
      })),
    },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: 'asc' },
    take: limit,
  })
  return rows
}

/** Returns the customer if this id is a store customer, or null for anyone else (staff included). */
export async function tillCustomerById(id: string): Promise<TillCustomer | null> {
  return db.user.findFirst({ where: { id, role: Role.CUSTOMER }, select: { id: true, name: true, email: true, phone: true } })
}
