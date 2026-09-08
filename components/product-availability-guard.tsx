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

    // update() writes text/attributes back into the same subtree the MutationObserver below
    // watches (childList/attributes/characterData). Writing unconditionally would requeue a
    // mutation on every run (textContent reassignment always replaces child text nodes, even
    // when the string is unchanged) and re-trigger the observer indefinitely, so every write
    // here is guarded to only touch the DOM when the value actually changes.
    const update = () => {
      const variantButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.focalVariantList button'))
      const selectedIndex = Math.max(0, variantButtons.findIndex(b => b.classList.contains('selected')))
      const selected = variants[selectedIndex]
      const available = selected?.available ?? productAvailable
      const canSell = !trackInventory || continueSellingWhenOutOfStock || available > 0
      const stock = root.querySelector<HTMLElement>('.focalStock')
      if (stock) {
        const text = canSell ? (trackInventory ? `${available} available · Fast delivery` : 'Available · Fast delivery') : 'Out of stock'
        if (stock.textContent !== text) stock.textContent = text
      }
      const add = root.querySelector<HTMLButtonElement>('.focalPurchaseRow .focalButton.primary')
      if (add) {
        const qty = Number(root.querySelector('.focalQty span')?.textContent || '1') || 1
        const allowed = canSell && (!trackInventory || continueSellingWhenOutOfStock || qty <= available)
        if (add.disabled !== !allowed) add.disabled = !allowed
        if (add.getAttribute('aria-disabled') !== String(!allowed)) add.setAttribute('aria-disabled', String(!allowed))
        const title = allowed ? '' : 'This quantity is not available'
        if (add.title !== title) add.title = title
      }
    }

    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
    return () => observer.disconnect()
  }, [variants, productAvailable, trackInventory, continueSellingWhenOutOfStock])

  return null
}
