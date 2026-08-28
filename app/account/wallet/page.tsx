import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { Footer } from '@/components/footer'

export default async function WalletPage(){
  const user=await getCurrentUser()
  if(!user)redirect('/account/login')
  const [wallet,coins,walletTransactions,coinTransactions]=await Promise.all([
    db.$queryRaw<Array<{balance:number;currency:string}>>`
      SELECT COALESCE(SUM("amount"),0)::int AS balance,
             COALESCE(MAX("currency"),${process.env.NEXT_PUBLIC_CURRENCY||'USD'}) AS currency
      FROM "WalletTransaction" WHERE "userId"=${user.id}
    `,
    db.$queryRaw<Array<{balance:number}>>`
      SELECT COALESCE(SUM("amount"),0)::int AS balance
      FROM "CoinTransaction" WHERE "userId"=${user.id}
    `,
    db.$queryRaw<Array<{id:string;amount:number;currency:string;type:string;reason:string|null;createdAt:Date}>>`
      SELECT "id","amount","currency","type","reason","createdAt"
      FROM "WalletTransaction" WHERE "userId"=${user.id}
      ORDER BY "createdAt" DESC LIMIT 25
    `,
    db.$queryRaw<Array<{id:string;amount:number;type:string;reason:string|null;createdAt:Date}>>`
      SELECT "id","amount","type","reason","createdAt"
      FROM "CoinTransaction" WHERE "userId"=${user.id}
      ORDER BY "createdAt" DESC LIMIT 25
    `,
  ])
  const walletBalance=Number(wallet[0]?.balance||0)
  const currency=wallet[0]?.currency||process.env.NEXT_PUBLIC_CURRENCY||'USD'
  const coinBalance=Math.max(0,Number(coins[0]?.balance||0))
  return <><main className="section"><div className="container"><div className="sectionHead"><div><Link className="textLink" href="/account">← Back to account</Link><span className="muted" style={{display:'block',marginTop:10}}>REWARDS</span><h1 className="h2">Wallet & coins</h1><p className="muted">Your store credit and loyalty balance, with a complete transaction history.</p></div></div><div className="grid twoColumn"><div className="card" style={{padding:24}}><span className="muted">WALLET BALANCE</span><div style={{fontSize:40,fontWeight:750,marginTop:8}}>{money(walletBalance,currency)}</div><p className="muted">Wallet credit can be used with Wallet checkout.</p></div><div className="card" style={{padding:24}}><span className="muted">COINS</span><div style={{fontSize:40,fontWeight:750,marginTop:8}}>{coinBalance.toLocaleString()}</div><p className="muted">1 coin = 0.01 in store currency when redeemed at checkout.</p></div></div><div className="grid twoColumn" style={{marginTop:20}}><section className="card" style={{padding:24}}><div className="sectionHead small"><h3>Wallet activity</h3><span className="muted">{walletTransactions.length} recent</span></div>{!walletTransactions.length?<p className="muted">No wallet activity yet.</p>:walletTransactions.map(tx=><div className="summaryLine" key={tx.id}><span><strong>{tx.type.replaceAll('_',' ')}</strong>{tx.reason&&<small className="muted">{tx.reason}</small>}<small className="muted">{new Date(tx.createdAt).toLocaleString()}</small></span><strong>{tx.amount>=0?'+':''}{money(tx.amount,tx.currency)}</strong></div>)}</section><section className="card" style={{padding:24}}><div className="sectionHead small"><h3>Coin activity</h3><span className="muted">{coinTransactions.length} recent</span></div>{!coinTransactions.length?<p className="muted">No coin activity yet.</p>:coinTransactions.map(tx=><div className="summaryLine" key={tx.id}><span><strong>{tx.type.replaceAll('_',' ')}</strong>{tx.reason&&<small className="muted">{tx.reason}</small>}<small className="muted">{new Date(tx.createdAt).toLocaleString()}</small></span><strong>{tx.amount>=0?'+':''}{tx.amount}</strong></div>)}</section></div></div></main><Footer/></>
}
