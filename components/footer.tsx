'use client'
import Link from 'next/link'
import { config } from '@/lib/config'

export function Footer() {
  return <>
    <style dangerouslySetInnerHTML={{__html:`.focalFooter{overflow:hidden}.focalFooter .footerGrid{min-width:0}.focalFooter .footerGrid>div{min-width:0}.focalFooter a,.focalFooter p{overflow-wrap:anywhere}@media(max-width:700px){.focalFooter{padding:40px 0}.focalFooter .footerGrid{grid-template-columns:1fr 1fr!important;gap:28px 20px}.focalFooter .footerGrid>div:first-child{grid-column:1/-1}.focalFooter .footerGrid strong{font-size:15px}.focalFooter .footerGrid p{margin:8px 0}.focalFooter .logo{font-size:20px}}`}}/>
    <footer className="footer focalFooter">
      <div className="focalContainer footerGrid">
        <div><div className="logo">{config.brand}</div><p className="muted">A refined shopping experience built to grow with your business.</p></div>
        <div><strong>Shop</strong><p><Link href="/shop">All products</Link></p><p><Link href="/collections">Collections</Link></p></div>
        <div><strong>Help</strong><p><Link href="/account">My account</Link></p><p><Link href="/checkout">Checkout</Link></p></div>
        <div><p className="muted">{new Date().getFullYear()} · All rights reserved</p></div>
      </div>
    </footer>
  </>
}
