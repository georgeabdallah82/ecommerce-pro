import { useEffect, useState } from 'react'

export function useWishlist() {
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const response = await fetch('/api/wishlist', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        const next: Record<string, boolean> = {}
        for (const item of Array.isArray(data.items) ? data.items : []) if (item?.productId) next[item.productId] = true
        if (alive) setWishlist(next)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  const toggleWish = async (id: string) => {
    const previous = Boolean(wishlist[id])
    setWishlist(w => ({ ...w, [id]: !previous }))
    try {
      const response = await fetch('/api/wishlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: id }) })
      if (!response.ok) setWishlist(w => ({ ...w, [id]: previous }))
    } catch {
      setWishlist(w => ({ ...w, [id]: previous }))
    }
  }

  return { wishlist, toggleWish }
}
