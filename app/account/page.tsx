import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { getStoreCurrency } from '@/lib/store-currency'
import { StoreFooter } from '@/components/store-footer'
import AddressBook from '@/components/address-book'
import ChangePassword from '@/components/change-password'
import DeleteAccount from '@/components/delete-account'
import BuyAgain from '@/components/buy-again'
import { buyAgainItems } from '@/lib/order-again'
import { getT } from '@/lib/i18n-server'
import { statusLabel } from '@/lib/i18n'

export default async function Account(){
  const u=await getCurrentUser()
  const t=await getT()
  if(!u)return <><main className="section"><div className="container"><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Your account')}</h1><div className="card" style={{padding:24,maxWidth:560}}><h3>{t('Sign in or create an account')}</h3><p className="muted">{t('Track orders, manage addresses, save favorites and leave reviews.')}</p><div style={{display:'flex',gap:10}}><Link className="btn" href="/account/login">{t('Sign in')}</Link><Link className="btn secondary" href="/account/register">{t('Create account')}</Link></div></div></div></main><StoreFooter /></>

  const buyAgain=await buyAgainItems(u.id).catch(()=>[])
  const [orders, orderCount, addresses, walletAggregate, walletCurrencyRow, coinAggregate, unreadNotifications, storeCurrency]=await Promise.all([
    db.order.findMany({where:{userId:u.id},orderBy:{createdAt:'desc'},take:20,include:{items:true}}),
    db.order.count({where:{userId:u.id}}),
    db.address.findMany({where:{userId:u.id},orderBy:{isDefault:'desc'}}),
    db.walletTransaction.aggregate({where:{userId:u.id},_sum:{amount:true}}),
    db.walletTransaction.findFirst({where:{userId:u.id},orderBy:{createdAt:'desc'},select:{currency:true}}),
    db.coinTransaction.aggregate({where:{userId:u.id},_sum:{amount:true}}),
    db.notification.count({where:{userId:u.id,readAt:null}}),
    getStoreCurrency(),
  ])
  const walletBalance=Number(walletAggregate._sum.amount||0)
  const walletCurrency=walletCurrencyRow?.currency||storeCurrency
  const coinBalance=Math.max(0,Number(coinAggregate._sum.amount||0))

  return <><main className="section"><div className="container"><div className="sectionHead"><div><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Welcome, {name}.',{name:u.name})}</h1></div><form action="/api/auth/logout" method="post"><button className="btn secondary">{t('Sign out')}</button></form></div><div className="grid accountStats"><div className="card stat"><span className="muted">{t('Orders')}</span><strong>{orderCount}</strong></div><div className="card stat"><span className="muted">{t('Saved addresses')}</span><strong>{addresses.length}</strong></div><div className="card stat"><span className="muted">{t('Wallet')}</span><strong>{money(walletBalance,walletCurrency)}</strong></div><div className="card stat"><span className="muted">{t('Coins')}</span><strong>{coinBalance.toLocaleString()}</strong></div><Link href="/account/notifications" className="card stat"><span className="muted">{t('Notifications')}</span><strong>{unreadNotifications}</strong></Link></div><div className="card" style={{padding:20,marginBottom:20}}><div className="sectionHead small"><div><span className="muted">{t('REWARDS')}</span><h3>{t('Your wallet & coins')}</h3><p className="muted">{t('Use wallet credit for Wallet checkout. Every 1 coin is worth 0.01 in store currency.')}</p></div><Link href="/account/wallet" className="btn secondary">{t('View wallet')}</Link></div><div className="grid twoColumn"><div><span className="muted">{t('Available wallet')}</span><div style={{fontSize:28,fontWeight:700,marginTop:4}}>{money(walletBalance,walletCurrency)}</div></div><div><span className="muted">{t('Available coins')}</span><div style={{fontSize:28,fontWeight:700,marginTop:4}}>{coinBalance.toLocaleString()}</div></div></div></div><BuyAgain items={buyAgain} currency={storeCurrency}/><div className="grid twoColumn"><section><div className="sectionHead small"><h3>{t('Recent orders')}</h3>{orderCount>orders.length?<Link className="textLink" href="/account/orders">{t('View all ({count})',{count:orderCount})}</Link>:<span className="muted">{t('Showing {shown} of {total}',{shown:orders.length,total:orderCount})}</span>}</div>{!orders.length?<div className="card empty"><p className="muted">{t('No orders yet.')}</p><Link href="/shop" className="btn">{t('Start shopping')}</Link></div>:<div className="grid" style={{gap:10}}>{orders.map(o=><Link href={`/account/orders/${o.orderNumber}`} className="card orderCard" key={o.id}><div><strong dir="ltr">#{o.orderNumber}</strong><span className="muted">{o.createdAt.toLocaleDateString()}</span></div><div><span className="pill">{statusLabel(t,o.status)}</span><strong>{money(o.grandTotal,o.currency)}</strong></div></Link>)}</div>}</section><AddressBook addresses={addresses}/><div className="card"><strong>{t('Your data')}</strong><p className="muted">{t('Download a copy of your account, addresses, orders, reviews and wishlist as a file.')}</p><a className="btn secondary" href="/api/account/data-export" download>{t('Download my data')}</a></div><ChangePassword/><DeleteAccount/></div></div></main><StoreFooter /></>
}
