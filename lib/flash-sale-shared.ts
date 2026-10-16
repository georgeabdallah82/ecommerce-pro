// Flash sale rules shared by the store pages (browser) and the server (lib/flash-sale.ts).

export type FlashSale = { id: string; percent: number; endsAt: string; all: boolean; productIds: string[] }

// The best flash sale for a product, if any (several can overlap; checkout picks the best too).
export function saleFor(sales: FlashSale[] | null | undefined, productId: string, now = Date.now()) {
  let best: FlashSale | null = null
  for (const sale of sales || []) {
    if (new Date(sale.endsAt).getTime() <= now) continue
    if (!sale.all && !sale.productIds.includes(productId)) continue
    if (!best || sale.percent > best.percent) best = sale
  }
  return best
}

export const salePrice = (price: number, percent: number) => price - Math.floor((price * percent) / 100)

// "02:14:09" or "2d 03:14:09" until the end.
export function countdown(endsAt: string, now = Date.now()) {
  let s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`
}
