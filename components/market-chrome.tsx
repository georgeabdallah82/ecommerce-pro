'use client'

// Site-wide pieces of the "market" storefront that sit around every page: the delivery bar and
// category tabs under the header, and the floating WhatsApp button. All three are edited in the
// theme studio (Theme settings › Delivery bar / WhatsApp button; the tabs follow Navigation).
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { whatsappUrl } from '@/lib/links'
import { parseDeliveryAreas } from '@/lib/storefront-market'

export const DELIVERY_AREA_KEY = 'ecom-delivery-area-v1'

export function readDeliveryArea(): string {
  try { return localStorage.getItem(DELIVERY_AREA_KEY) || '' } catch { return '' }
}

export function DeliveryBar({ theme }: { theme: any }) {
  const d = theme.delivery || {}
  const areas = parseDeliveryAreas(d.areas)
  const [area, setArea] = useState('')
  useEffect(() => { const saved = readDeliveryArea(); if (saved) setArea(saved) }, [])
  if (d.enabled === false || !areas.length) return null
  const current = areas.find(a => a.name === area) || areas[0]
  const choose = (name: string) => { setArea(name); try { localStorage.setItem(DELIVERY_AREA_KEY, name) } catch {} }
  return (
    <div className="mkDelivery">
      <div className="mkWrap mkDeliveryInner">
        <MapPin size={16} className="mkDeliveryPin" aria-hidden="true" />
        <label>{d.label || 'Delivering to'}{' '}
          <select value={current.name} onChange={e => choose(e.target.value)} aria-label="Delivery area">
            {areas.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>
        {current.eta ? <><span className="mkSep" aria-hidden="true">|</span><span>{d.etaLabel || 'Delivery'}: <b>{current.eta}</b></span></> : null}
        {d.note ? <><span className="mkSep" aria-hidden="true">|</span><span className="mkDeliveryNote">{d.note}</span></> : null}
      </div>
    </div>
  )
}

type NavItem = { id: string; label: string; url?: string | null; parentId?: string | null }

export function CategoryTabs({ navigation }: { navigation: NavItem[] }) {
  const pathname = usePathname() || '/'
  const [search, setSearch] = useState('')
  useEffect(() => { setSearch(window.location.search) }, [pathname])
  const roots = (navigation || []).filter(item => !item.parentId && item.label)
  if (!roots.length) return null
  const here = pathname + search
  return (
    <nav className="mkCats" aria-label="Categories">
      <div className="mkWrap mkCatsInner">
        {roots.map(item => {
          const url = item.url || '#'
          const active = url !== '#' && (url === here || (url !== '/' && url === pathname))
          return <Link key={item.id} href={url} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>{item.label}</Link>
        })}
      </div>
    </nav>
  )
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" /></svg>
}

// Shared by every page, so the store settings request is made once per page load.
let settingsRequest: Promise<any> | null = null
function storeSettings() {
  settingsRequest ??= fetch('/api/store/settings').then(r => (r.ok ? r.json() : null)).catch(() => null)
  return settingsRequest
}

// The theme studio frame renders its own copy with the draft settings (theme.__preview); the
// root layout's copy (published settings) stays out of it.
export function WhatsAppFloat({ theme }: { theme: any }) {
  const w = theme.whatsapp || {}
  const pathname = usePathname() || '/'
  const [store, setStore] = useState<{ phone: string; country: string } | null>(null)
  const enabled = w.enabled === true
  useEffect(() => {
    if (!enabled) return
    let live = true
    storeSettings().then(data => {
      const s = data?.settings
      if (live) setStore({ phone: s?.contact?.phone || '', country: s?.store?.country || 'Lebanon' })
    })
    return () => { live = false }
  }, [enabled])
  if (!enabled || !store) return null
  // Never over the checkout form or inside the admin.
  if (pathname.startsWith('/admin') || pathname.startsWith('/checkout')) return null
  if (pathname === '/theme-editor-preview' && !theme.__preview) return null
  // The number set in the theme studio, or else the store's contact phone (Settings).
  const base = whatsappUrl(String(w.number || '').trim() || store.phone, store.country)
  if (!base) return null
  const href = w.message ? `${base}?text=${encodeURIComponent(String(w.message).slice(0, 500))}` : base
  const label = String(w.label || '').trim()
  return (
    <a
      className={`mkWhatsApp ${w.position === 'left' ? 'left' : 'right'} ${w.showOnMobile === false ? 'desktopOnly' : ''} ${label ? 'hasLabel' : ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label || 'Chat with us on WhatsApp'}
    >
      <WhatsAppIcon />
      {label ? <span>{label}</span> : null}
    </a>
  )
}
