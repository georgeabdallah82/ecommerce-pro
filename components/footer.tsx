'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { config } from '@/lib/config'

// lucide-react 1.x dropped brand/logo icons entirely (kept to generic UI
// glyphs only), so these platform icons are small hand-drawn SVGs rather
// than an import -- simple monochrome line-art, not a pixel-accurate logo
// recreation, which is all a "link to our page" icon needs to be.
function InstagramIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg> }
function FacebookIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H16.7V3.7C16.4 3.66 15.4 3.57 14.24 3.57c-2.4 0-4.05 1.47-4.05 4.16v2.16H7.5v3.1h2.69V21h3.31z" /></svg> }
function TikTokIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 3c.3 2.2 1.8 3.9 4 4.2v2.8c-1.4 0-2.8-.4-4-1.2v6.4c0 3.2-2.6 5.8-5.8 5.8S5 18.4 5 15.2 7.6 9.4 10.8 9.4c.3 0 .6 0 .9.06v2.9a2.9 2.9 0 1 0 2 2.75V3h2.8z" /></svg> }
function XIcon() { return <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M18.24 2H21.5l-7.5 8.57L22.8 22h-6.9l-5.4-6.9L4.3 22H1L9 12.9.9 2H8l4.9 6.3L18.24 2Zm-1.2 18h1.9L7.1 4H5.1l11.94 16Z" /></svg> }
function YoutubeIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22 12s0-3.2-.4-4.7c-.24-.9-.94-1.6-1.84-1.84C18.2 5 12 5 12 5s-6.2 0-7.76.46c-.9.24-1.6.94-1.84 1.84C2 8.8 2 12 2 12s0 3.2.4 4.7c.24.9.94 1.6 1.84 1.84C5.8 19 12 19 12 19s6.2 0 7.76-.46c.9-.24 1.6-.94 1.84-1.84C22 15.2 22 12 22 12Zm-12 3V9l5.2 3-5.2 3Z" /></svg> }

const SOCIAL_LINKS: Array<{ key: string; label: string; Icon: () => React.JSX.Element }> = [
  { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon },
  { key: 'twitter', label: 'X', Icon: XIcon },
  { key: 'youtube', label: 'YouTube', Icon: YoutubeIcon },
]

export function Footer({ theme }: { theme?: any }) {
  const social: Record<string, string> = theme?.social || {}
  const activeSocial = SOCIAL_LINKS.filter(item => social[item.key])
  const brand = theme?.brandName || config.brand

  // Admin Settings' "Phone / WhatsApp" field (contact.phone) lets a merchant override the
  // build-time NEXT_PUBLIC_WHATSAPP_NUMBER without a redeploy -- fetched client-side (like the
  // free-shipping-threshold banner in aliexpress-cart.tsx) so this component, used across ~30
  // pages, doesn't need a new prop threaded through every call site.
  const [whatsapp, setWhatsapp] = useState(config.whatsapp)
  useEffect(() => {
    let active = true
    fetch('/api/store/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => { if (active && data?.settings?.contact?.phone) setWhatsapp(data.settings.contact.phone) })
      .catch(() => {})
    return () => { active = false }
  }, [])
  const whatsappDigits = whatsapp.replace(/[^\d+]/g, '')

  return <>
    <style dangerouslySetInnerHTML={{ __html: `
.focalFooter{overflow:hidden}
.focalFooter .footerGrid{min-width:0}
.focalFooter .footerGrid>div{min-width:0}
.focalFooter a,.focalFooter p{overflow-wrap:anywhere}
.focalFooterHelp{background:var(--store-primary,#d42a2a);color:#fff}
.focalFooterHelpInner{display:flex;align-items:center;justify-content:center;gap:14px;padding:14px 0;font-size:13px;font-weight:700;flex-wrap:wrap;text-align:center}
.focalFooterWhatsapp{display:inline-flex;align-items:center;gap:7px;background:#fff;color:var(--store-primary,#d42a2a);padding:8px 16px;border-radius:999px;font-weight:800;font-size:12px}
.footerGrid.marketplace{grid-template-columns:1.4fr 1fr 1fr 1fr}
.focalFooterSocial{display:flex;gap:8px;margin-top:16px}
.focalFooterSocial a{width:34px;height:34px;border-radius:50%;background:var(--store-primary,#d42a2a);color:#fff;display:inline-flex;align-items:center;justify-content:center}
.focalFooterSocial a:hover{opacity:.85}
.focalFooterBottom{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px 0;margin-top:12px;border-top:1px solid rgba(255,255,255,.12);font-size:12px}
.focalFooterPayments{display:flex;gap:8px;flex-wrap:wrap}
.focalFooterPayments span{border:1px solid rgba(255,255,255,.22);border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;letter-spacing:.02em}
@media(max-width:700px){
  .focalFooter{padding:40px 0}
  .footerGrid.marketplace,.focalFooter .footerGrid{grid-template-columns:1fr 1fr!important;gap:28px 20px}
  .focalFooter .footerGrid>div:first-child{grid-column:1/-1}
  .focalFooter .footerGrid strong{font-size:15px}
  .focalFooter .footerGrid p{margin:8px 0}
  .focalFooter .logo{font-size:20px}
  .focalFooterBottom{justify-content:center;text-align:center}
}
` }} />
    {whatsapp && (
      <div className="focalFooterHelp">
        <div className="focalContainer focalFooterHelpInner">
          <span>Need help with your order?</span>
          <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="focalFooterWhatsapp">
            <MessageCircle size={15} /> WhatsApp us
          </a>
        </div>
      </div>
    )}
    <footer className="footer focalFooter">
      <div className="focalContainer footerGrid marketplace">
        <div>
          <div className="logo">{brand}</div>
          <p className="muted">A refined shopping experience built to grow with your business.</p>
          {activeSocial.length > 0 && (
            <div className="focalFooterSocial">
              {activeSocial.map(({ key, label, Icon }) => (
                <a key={key} href={social[key]} target="_blank" rel="noopener noreferrer" aria-label={label}><Icon /></a>
              ))}
            </div>
          )}
        </div>
        <div>
          <strong>Shop</strong>
          <p><Link href="/shop">All products</Link></p>
          <p><Link href="/collections">Collections</Link></p>
          <p><Link href="/wishlist">Wishlist</Link></p>
        </div>
        <div>
          <strong>Account</strong>
          <p><Link href="/account">My account</Link></p>
          <p><Link href="/orders/lookup">Track your order</Link></p>
          <p><Link href="/cart">Cart</Link></p>
        </div>
        <div>
          <strong>Legal</strong>
          <p><Link href="/privacy-policy">Privacy Policy</Link></p>
          <p><Link href="/terms-of-service">Terms of Service</Link></p>
          <p><Link href="/refund-policy">Refund Policy</Link></p>
        </div>
      </div>
      <div className="focalContainer focalFooterBottom">
        <span className="muted">{new Date().getFullYear()} &middot; {brand} &middot; All rights reserved</span>
        <div className="focalFooterPayments">
          <span>Card</span>
          <span>Cash on delivery</span>
          <span>Bank transfer</span>
        </div>
      </div>
    </footer>
  </>
}
