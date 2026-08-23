'use client'

import { useEffect } from 'react'

type VariantAvailability = { name: string; sku: string; available: number }

export default function ProductAvailabilityGuard({
  variants,
  productAvailable,
  trackInventory,
  continueSellingWhenOutOfStock,
}: {
  variants: VariantAvailability[]
  productAvailable: number
  trackInventory: boolean
  continueSellingWhenOutOfStock: boolean
}) {
  useEffect(() => {
    const root = document.querySelector('.focalProductDetail')
    if (!root) return

    const update = () => {
      const variantButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.focalVariantList button'))
      const selectedIndex = Math.max(0, variantButtons.findIndex(b => b.classList.contains('selected')))
      const selected = variants[selectedIndex]
      const available = selected?.available ?? productAvailable
      const canSell = !trackInventory || continueSellingWhenOutOfStock || available > 0
      const stock = root.querySelector<HTMLElement>('.focalStock')
      if (stock) stock.textContent = canSell ? (trackInventory ? `${available} available · Fast delivery` : 'Available · Fast delivery') : 'Out of stock'
      const add = root.querySelector<HTMLButtonElement>('.focalPurchaseRow .focalButton.primary')
      if (add) {
        const qty = Number(root.querySelector('.focalQty span')?.textContent || '1') || 1
        const allowed = canSell && (!trackInventory || continueSellingWhenOutOfStock || qty <= available)
        add.disabled = !allowed
        add.setAttribute('aria-disabled', String(!allowed))
        add.title = allowed ? '' : 'This quantity is not available'
      }
    }

    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
    return () => observer.disconnect()
  }, [variants, productAvailable, trackInventory, continueSellingWhenOutOfStock])

  return null
}
