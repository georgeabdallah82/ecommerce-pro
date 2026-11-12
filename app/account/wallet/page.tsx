import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { getStoreCurrency } from '@/lib/store-currency'
import { StoreFooter } from '@/components/store-footer'
import { getT } from '@/lib/i18n-server'

export default async function WalletPage(){
  const t = await getT()

  const user=await getCurrentUser()
  if(!user)redirect('/account/login?next=%2Faccount%2Fwallet')
  const [walletAggregate,walletCurrencyRow,coinAggregate,walletTransactions,coinTransactions,storeCurrency]=await Promise.all([
    db.walletTransaction.aggregate({where:{userId:user.id},_sum:{amount:true}}),
    db.walletTransaction.findFirst({where:{userId:user.id},orderBy:{createdAt:'desc'},select:{currency:true}}),
    db.coinTransaction.aggregate({where:{userId:user.id},_sum:{amount:true}}),
    db.walletTransaction.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:25,select:{id:true,amount:true,currency:true,type:true,reason:true,createdAt:true}}),
    db.coinTransaction.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:25,select:{id:true,amount:true,type:true,reason:true,createdAt:true}}),
    getStoreCurrency(),
  ])
  const walletBalance=Number(walletAggregate._sum.amount||0)
  const currency=walletCurrencyRow?.currency||storeCurrency
  const coinBalance=Math.max(0,Number(coinAggregate._sum.amount||0))
  return <><main className="section"><div className="container"><div className="sectionHead"><div><Link className="textLink" href="/account">{t('Back to account')}</Link><span className="muted" style={{display:'block',marginTop:10}}>{t('REWARDS')}</span><h1 className="h2">{t('Wallet & coins')}</h1><p className="muted">{t('Your store credit and loyalty balance, with a complete transaction history.')}</p></div></div><div className="grid twoColumn"><div className="card" style={{padding:24}}><span className="muted">{t('WALLET BALANCE')}</span><div style={{fontSize:40,fontWeight:750,marginTop:8}}>{money(walletBalance,currency)}</div><p className="muted">{t('Wallet credit can be used with Wallet checkout.')}</p></div><div className="card" style={{padding:24}}><span className="muted">{t('COINS')}</span><div style={{fontSize:40,fontWeight:750,marginTop:8}}>{coinBalance.toLocaleString()}</div><p className="muted">{t('1 coin = 0.01 in store currency when redeemed at checkout.')}</p></div></div><div className="grid twoColumn" style={{marginTop:20}}><section className="card" style={{padding:24}}><div className="sectionHead small"><h2 className="accountTitle">{t('Wallet activity')}</h2><span className="muted">{t('{n} recent', { n: walletTransactions.length })}</span></div>{!walletTransactions.length?<p className="muted">{t('No wallet activity yet.')}</p>:walletTransactions.map(tx=><div className="summaryLine" key={tx.id}><span><strong>{tx.type.replaceAll('_',' ')}</strong>{tx.reason&&<small className="muted">{tx.reason}</small>}<small className="muted">{new Date(tx.createdAt).toLocaleString()}</small></span><strong>{tx.amount>=0?'+':''}{money(tx.amount,tx.currency)}</strong></div>)}</section><section className="card" style={{padding:24}}><div className="sectionHead small"><h2 className="accountTitle">{t('Coin activity')}</h2><span className="muted">{t('{n} recent', { n: coinTransactions.length })}</span></div>{!coinTransactions.length?<p className="muted">{t('No coin activity yet.')}</p>:coinTransactions.map(tx=><div className="summaryLine" key={tx.id}><span><strong>{tx.type.replaceAll('_',' ')}</strong>{tx.reason&&<small className="muted">{tx.reason}</small>}<small className="muted">{new Date(tx.createdAt).toLocaleString()}</small></span><strong>{tx.amount>=0?'+':''}{tx.amount}</strong></div>)}</section></div></div></main><StoreFooter /></>
}
