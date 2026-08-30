import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { Footer } from '@/components/footer'
import CustomerNotifications from '@/components/customer-notifications'

export default async function Account(){
  const u=await getCurrentUser()
  if(!u)return <><main className="section"><div className="container"><span className="muted">ACCOUNT</span><h1 className="h2">Your account</h1><div className="card" style={{padding:24,maxWidth:560}}><h3>Sign in or create an account</h3><p className="muted">Track orders, manage addresses, save favorites and leave reviews.</p><div style={{display:'flex',gap:10}}><Link className="btn" href="/account/login">Sign in</Link><Link className="btn secondary" href="/account/register">Create account</Link></div></div></div></main><Footer/></>

  const [orders, orderCount, addresses, walletRows, coinRows]=await Promise.all([
    db.order.findMany({where:{userId:u.id},orderBy:{createdAt:'desc'},take:20,include:{items:true}}),
    db.order.count({where:{userId:u.id}}),
    db.address.findMany({where:{userId:u.id},orderBy:{isDefault:'desc'}}),
    db.$queryRaw<Array<{balance:number;currency:string}>>`
      SELECT COALESCE(SUM("amount"),0)::int AS balance,
             COALESCE(MAX("currency"),${process.env.NEXT_PUBLIC_CURRENCY||'USD'}) AS currency
      FROM "WalletTransaction" WHERE "userId"=${u.id}
    `,
    db.$queryRaw<Array<{balance:number}>>`
      SELECT COALESCE(SUM("amount"),0)::int AS balance
      FROM "CoinTransaction" WHERE "userId"=${u.id}
    `,
  ])
  const walletBalance=Number(walletRows[0]?.balance||0)
  const walletCurrency=walletRows[0]?.currency||process.env.NEXT_PUBLIC_CURRENCY||'USD'
  const coinBalance=Math.max(0,Number(coinRows[0]?.balance||0))
  const vapidPublicKey=process.env.VAPID_PUBLIC_KEY||process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  return <><main className="section"><div className="container"><div className="sectionHead"><div><span className="muted">ACCOUNT</span><h1 className="h2">Welcome, {u.name}.</h1></div><form action="/api/auth/logout" method="post"><button className="btn secondary">Sign out</button></form></div><div className="grid accountStats"><div className="card stat"><span className="muted">Orders</span><strong>{orderCount}</strong></div><div className="card stat"><span className="muted">Saved addresses</span><strong>{addresses.length}</strong></div><div className="card stat"><span className="muted">Wallet</span><strong>{money(walletBalance,walletCurrency)}</strong></div><div className="card stat"><span className="muted">Coins</span><strong>{coinBalance.toLocaleString()}</strong></div></div><div className="card" style={{padding:20,marginBottom:20}}><div className="sectionHead small"><div><span className="muted">REWARDS</span><h3>Your wallet & coins</h3><p className="muted">Use wallet credit for Wallet checkout. Every 1 coin is worth 0.01 in store currency.</p></div><Link href="/account/wallet" className="btn secondary">View wallet</Link></div><div className="grid twoColumn"><div><span className="muted">Available wallet</span><div style={{fontSize:28,fontWeight:700,marginTop:4}}>{money(walletBalance,walletCurrency)}</div></div><div><span className="muted">Available coins</span><div style={{fontSize:28,fontWeight:700,marginTop:4}}>{coinBalance.toLocaleString()}</div></div></div></div><CustomerNotifications vapidPublicKey={vapidPublicKey}/><div className="grid twoColumn"><section><div className="sectionHead small"><h3>Recent orders</h3><span className="muted">Showing {orders.length} of {orderCount}</span></div>{!orders.length?<div className="card empty"><p className="muted">No orders yet.</p><Link href="/shop" className="btn">Start shopping</Link></div>:<div className="grid" style={{gap:10}}>{orders.map(o=><Link href={`/account/orders/${o.orderNumber}`} className="card orderCard" key={o.id}><div><strong>#{o.orderNumber}</strong><span className="muted">{o.createdAt.toLocaleDateString()}</span></div><div><span className="pill">{o.status}</span><strong>{money(o.grandTotal,o.currency)}</strong></div></Link>)}</div>}</section><section><div className="sectionHead small"><h3>Addresses</h3></div>{addresses.length?<div className="grid" style={{gap:10}}>{addresses.map(a=><div className="card" style={{padding:18}} key={a.id}><div style={{display:'flex',justifyContent:'space-between'}}><strong>{a.label||'Address'}</strong>{a.isDefault&&<span className="pill">Default</span>}</div><p className="muted">{a.firstName} {a.lastName}<br/>{a.line1}{a.line2&&<><br/>{a.line2}</>}<br/>{a.city}{a.region?`, ${a.region}`:''}<br/>{a.country}</p></div>)}</div>:<div className="card empty"><p className="muted">No saved addresses.</p></div>}</section></div></div></main><Footer/></>
}
