import { collectsCashOnDelivery } from '@/lib/orders'
import { addressLines, customerName, customerPhone, mapLabel, mapsLink, shippingAddress, type FlowOrder } from '@/lib/order-flow'

// The daily delivery sheet (Admin > Orders > Delivery sheet): orders ready to go out and out for
// delivery, grouped by area, with the cash the driver brings back, and one WhatsApp message with
// the whole run for the driver.

type Money = (cents: number, currency: string) => string
export type SheetOrder = FlowOrder & { id: string; driverId?: string | null }

export const toCollect = (order: Pick<FlowOrder, 'paymentMethod' | 'paymentStatus' | 'grandTotal'>) =>
  collectsCashOnDelivery({ paymentMethod: String(order.paymentMethod || ''), paymentStatus: order.paymentStatus }) ? order.grandTotal : 0

export function orderArea(order: Pick<FlowOrder, 'shippingAddressJson'>) {
  const a = shippingAddress(order.shippingAddressJson)
  return String(a.region || a.city || '').trim() || 'No area'
}

// Areas in the order of the store's delivery areas list (Theme settings > Delivery bar), then
// any others alphabetically; "No area" last. Orders keep their order inside an area.
export function groupByArea<T extends Pick<FlowOrder, 'shippingAddressJson'>>(orders: T[], areaOrder: string[] = []) {
  const groups = new Map<string, T[]>()
  for (const order of orders) {
    const area = orderArea(order)
    groups.set(area, [...(groups.get(area) || []), order])
  }
  const rank = (area: string) => {
    if (area === 'No area') return [2, 0] as const
    const i = areaOrder.findIndex(a => a.trim().toLowerCase() === area.toLowerCase())
    return i >= 0 ? [0, i] as const : [1, 0] as const
  }
  return [...groups.entries()]
    .sort(([a], [b]) => { const [ra, ia] = rank(a); const [rb, ib] = rank(b); return ra - rb || ia - ib || a.localeCompare(b) })
    .map(([area, list]) => ({ area, orders: list }))
}

export function driverRunMessage(orders: FlowOrder[], storeName: string, dayLabel: string, money: Money) {
  const currency = orders[0]?.currency || 'USD'
  const total = orders.reduce((sum, o) => sum + toCollect(o), 0)
  const blocks = orders.map((order, i) => {
    const a = shippingAddress(order.shippingAddressJson)
    const collect = toCollect(order)
    const items = (order.items || []).map(item => `${item.quantity} × ${item.name}${item.variant?.name && item.variant.name !== 'Default Title' ? ` (${item.variant.name})` : ''}`).join(', ')
    return [
      `${i + 1}) #${order.orderNumber} · ${customerName(order)}${customerPhone(order) ? ` · ${customerPhone(order)}` : ''}`,
      addressLines(order).join(', ') || '—',
      ...(a.notes ? [`Note: ${String(a.notes).trim()}`] : []),
      ...(items ? [items] : []),
      collect ? `Collect: ${money(collect, order.currency)} cash` : 'Paid: collect nothing',
      ...(mapsLink(order) ? [`${mapLabel(order)}: ${mapsLink(order)}`] : []),
    ].join('\n')
  })
  return [
    `${storeName ? `${storeName} · ` : ''}Deliveries${dayLabel ? ` for ${dayLabel}` : ''} (${orders.length})`,
    '',
    blocks.join('\n\n'),
    '',
    `Total to collect: ${money(total, currency)}`,
  ].join('\n')
}
