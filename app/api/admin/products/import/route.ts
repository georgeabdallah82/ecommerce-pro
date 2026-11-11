import { routeError } from '@/lib/api-error'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { saveMediaFromUrl } from '@/lib/media-storage'
import { importSku, importSource, importVariants, isBlockedPage, isPublicHttpUrl, normalizeImport, parseProductHtml } from '@/lib/product-import'
import { POST as createProduct } from '@/app/api/admin/products/route'
import { userError } from '@/lib/user-error'

const BLOCKED_HELP = "This site doesn't let other servers read its pages (it shows them a captcha). Open the product in your browser and tap your Import bookmark instead — it reads the page you're looking at. Setup steps are on this page."

// action "fetch": read a pasted link on the server (for shops that allow it).
// action "create": turn the reviewed product into a draft -- photos are copied into Files, the
// supplier price is saved as the cost, and the product opens in the editor.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const b = await req.json().catch(() => ({}))

    if (b.action === 'fetch') {
      const url = String(b.url || '').trim()
      if (!isPublicHttpUrl(url)) return json({ error: 'Paste the full product link, starting with https://' }, { status: 400 })
      const { source } = importSource(url)
      let html = ''
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; StoreProductImporter/1.0)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
        html = (await res.text()).slice(0, 3_000_000)
        if (!res.ok && !html) throw userError(`The site answered ${res.status}`)
      } catch (e) {
        // The big marketplaces refuse servers; point to the browser button rather than a network error.
        if (source !== 'other') return json({ error: BLOCKED_HELP, blocked: true }, { status: 422 })
        return json({ error: `Couldn't open that link (${e instanceof Error ? e.message : 'network error'}).` }, { status: 422 })
      }
      if (isBlockedPage(html)) return json({ error: BLOCKED_HELP, blocked: true }, { status: 422 })
      const product = parseProductHtml(html, url)
      if (!product) return json({ error: source === 'other' ? "Couldn't find a product on that page. Check it's the product's own page." : BLOCKED_HELP, blocked: source !== 'other' }, { status: 422 })
      return json({ product })
    }

    if (b.action === 'create') {
      const product = normalizeImport(b.product)
      if (!product.title) return json({ error: 'The product needs a name' }, { status: 400 })
      const chosen = (Array.isArray(b.images) ? b.images.map(String) : product.images).filter((u: string) => product.images.includes(u)).slice(0, 10)
      const priceCents = Math.max(0, Math.round(Number(b.priceCents) || 0))
      const costCents = b.costCents === null || b.costCents === undefined || b.costCents === '' ? null : Math.max(0, Math.round(Number(b.costCents) || 0))
      const quantity = b.quantity === null || b.quantity === undefined || b.quantity === '' ? null : Math.max(0, Math.trunc(Number(b.quantity) || 0))

      // Photos, a few at a time; one that won't download is skipped rather than failing the import.
      const saved: Array<{ url: string; alt: string }> = []
      const failed: string[] = []
      const queue = chosen.map((url: string, index: number) => ({ url, index }))
      const results: Array<{ url: string; alt: string } | null> = new Array(queue.length).fill(null)
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          try {
            const asset = await saveMediaFromUrl(item.url, `${product.title.slice(0, 60)} ${item.index + 1}`, product.title)
            results[item.index] = { url: asset.url, alt: product.title }
          } catch { failed.push(item.url) }
        }
      }))
      for (const r of results) if (r) saved.push(r)

      // Options beyond the first become variants' neighbours in the description, so nothing is lost.
      const extraOptions = product.options.slice(1).map(o => `${o.name}: ${o.values.join(', ')}`)
      const description = [product.description, ...(extraOptions.length ? ['', 'Options:', ...extraOptions] : [])].join('\n').trim()
      let sku = importSku(product.sourceUrl)
      const variants = importVariants(product.options, sku, priceCents)
      const payload = (skuValue: string) => ({
        name: product.title, sku: skuValue, description, status: 'DRAFT',
        basePrice: priceCents, costPrice: costCents, images: saved,
        // Stock is counted only when a quantity was given; otherwise the product stays buyable.
        trackInventory: quantity !== null, quantity: quantity ?? 0,
        variants: variants.map(v => ({ ...v, sku: v.sku.replace(sku, skuValue), quantity: quantity ?? 0 })),
        sharedInventory: variants.length > 0 && quantity !== null,
      })
      let res = await createProduct(new Request(req.url, { method: 'POST', headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') || '' }, body: JSON.stringify(payload(sku)) }))
      if (res.status === 409) {
        sku = `${sku}-${Date.now().toString(36).slice(-4).toUpperCase()}`
        res = await createProduct(new Request(req.url, { method: 'POST', headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') || '' }, body: JSON.stringify(payload(sku)) }))
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return json({ error: data.error || 'Could not create the product' }, { status: res.status })
      const id = data.product?.id || data.id
      await audit(actor.id, 'product.imported', 'Product', id, { source: product.sourceUrl, images: saved.length, failedImages: failed.length })
      return json({ id, images: saved.length, failedImages: failed.length }, { status: 201 })
    }

    return json({ error: 'Unknown import action' }, { status: 400 })
  } catch (e) {
    return routeError(e, 'Import failed', 400)
  }
}
