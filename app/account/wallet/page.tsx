import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { Footer } from '@/components/footer'

export default async function WalletPage(){
  const user=await getCurrentUser()
  if(!user)redirect('/account/login')
  const [walletAggregate,walletCurrencyRow,coinAggregate,walletTransactions,coinTransactions]=await Promise.all([
    db.walletTransaction.aggregate({where:{userId:user.id},_sum:{amount:true}}),
    db.walletTransaction.findFirst({where:{userId:user.id},orderBy:{createdAt:'desc'},select:{currency:true}}),
    db.coinTransaction.aggregate({where:{userId:user.id},_sum:{amount:true}}),
    db.walletTransaction.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:25,select:{id:true,amount:true,currency:true,type:true,reason:true,createdAt:true}}),
    db.coinTransaction.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:25,select:{id:true,amount:true,type:true,reason:true,createdAt:true}}),
  ])
  const walletBalance=Number(walletAggregate._sum.amount||0)
  const currency=walletCurrencyRow?.currency||process.env.NEXT_PUBLIC_CURRENCY||'USD'
  const coinBalance=Math.max(0,Number(coinAggregate._sum.amount||0))
  return <><main className="section"><div className="container"><div className="sectionHead"><div><Link className="textLink" href="/account">← Back to account</Link><span className="muted" style={{display:'block',marginTop:10}}>REWARDS</span><h1 className="h2">Wallet & coins</h1><p className="muted">Your store credit and loyalty balance, with a complete transaction history.</p></div></div><div className="grid twoColumn"><div className="card" style={{padding:24}}><span className="muted">WALLET BALANCE</span><div style={{fontSize:40,fontWeight:750,marginTop:8}}>{money(walletBalance,currency)}</div><p className="muted">Wallet credit can be used with Wallet checkout.</p></div><div className="card" style={{padding:24}}><span className="muted">COINS</span><div style={{fontSize:40,fontWeight:750,marginTop:8}}>{coinBalance.toLocaleString()}</div><p className="muted">1 coin = 0.01 in store currency when redeemed at checkout.</p></div></div><div className="grid twoColumn" style={{marginTop:20}}><section className="card" style={{padding:24}}><div className="sectionHead small"><h3>Wallet activity</h3><span className="muted">{walletTransactions.length} recent</span></div>{!walletTransactions.length?<p className="muted">No wallet activity yet.</p>:walletTransactions.map(tx=><div className="summaryLine" key={tx.id}><span><strong>{tx.type.replaceAll('_',' ')}</strong>{tx.reason&&<small className="muted">{tx.reason}</small>}<small className="muted">{new Date(tx.createdAt).toLocaleString()}</small></span><strong>{tx.amount>=0?'+':''}{money(tx.amount,tx.currency)}</strong></div>)}</section><section className="card" style={{padding:24}}><div className="sectionHead small"><h3>Coin activity</h3><span className="muted">{coinTransactions.length} recent</span></div>{!coinTransactions.length?<p className="muted">No coin activity yet.</p>:coinTransactions.map(tx=><div className="summaryLine" key={tx.id}><span><strong>{tx.type.replaceAll('_',' ')}</strong>{tx.reason&&<small className="muted">{tx.reason}</small>}<small className="muted">{new Date(tx.createdAt).toLocaleString()}</small></span><strong>{tx.amount>=0?'+':''}{tx.amount}</strong></div>)}</section></div></div></main><Footer/></>
}
