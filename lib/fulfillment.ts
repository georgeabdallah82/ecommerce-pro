import { prisma } from '@/lib/prisma'

export async function createShipment(input: { orderId: string; carrier?: string; trackingNumber?: string; trackingUrl?: string }) {
  return prisma.shipment.create({ data: input })
}

export async function updateShipment(id: string, input: { status?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string }) {
  return prisma.shipment.update({ where: { id }, data: input })
}
