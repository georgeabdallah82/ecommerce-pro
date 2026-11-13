import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Coins, Minus, Plus, Wallet } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { getStoreCurrency } from '@/lib/store-currency'
import { StoreFooter } from '@/components/store-footer'
import { getLang, getT } from '@/lib/i18n-server'
import { dateLocale, markT } from '@/lib/i18n'

// What each kind of entry means to the shopper. The stored type is a code (CREDIT, REDEMPTION, ...); the page printed
// it as it is, in English capitals on the Arabic page too. A code not listed here is shown in plain words.
const WALLET_LABELS: Record<string, string> = {
  CREDIT: markT('Credit added'), DEBIT: markT('Credit removed'), PAYMENT: markT('Paid for an order'), REFUND: markT('Refund'),
  REVERSAL: markT('Returned to you'), ADJUSTMENT: markT('Adjustment'), EXPIRED: markT('Expired'),
}
const COIN_LABELS: Record<string, string> = {
  CREDIT: markT('Coins added'), DEBIT: markT('Coins removed'), EARN: markT('Earned'), REDEMPTION: markT('Used at checkout'),
  REFUND: markT('Refund'), REVERSAL: markT('Returned to you'), ADJUSTMENT: markT('Adjustment'), EXPIRED: markT('Expired'),
}
const plainWords = (code: string) => code.charAt(0) + code.slice(1).toLowerCase().replaceAll('_', ' ')

export default async function WalletPage(){
  const [t, lang] = await Promise.all([getT(), getLang()])
  const locale = dateLocale(lang)

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

  // One line per entry: what it was, the store's note and the date (they ran together as "DEBITLive check11/12/2026"),
  // and the amount, with money coming in marked in green (app/storefront-details.css).
  const entry = (tx: { id: string; amount: number; type: string; reason: string | null; createdAt: Date }, label: string, amount: string) => {
    const incoming = tx.amount >= 0
    return <li className="walletEntry" key={tx.id}>
      <span className={incoming ? 'walletEntryIcon isIn' : 'walletEntryIcon'} aria-hidden="true">{incoming ? <Plus size={16} /> : <Minus size={16} />}</span>
      <span className="walletEntryText">
        <strong>{label}</strong>
        <small>{tx.reason ? <><span dir="auto">{tx.reason}</span> · </> : null}{tx.createdAt.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</small>
      </span>
      <strong className={incoming ? 'walletEntryAmount isIn' : 'walletEntryAmount'} dir="ltr">{incoming ? '+' : ''}{amount}</strong>
    </li>
  }

  return <><main className="section"><div className="container">
    <div className="sectionHead"><div><Link className="textLink" href="/account">{t('Back to account')}</Link><span className="muted" style={{display:'block',marginTop:10}}>{t('REWARDS')}</span><h1 className="h2">{t('Wallet & coins')}</h1><p className="muted">{t('Your store credit and loyalty balance, with a complete transaction history.')}</p></div></div>
    <div className="grid twoColumn walletBalances">
      <div className="card walletBalance"><span className="walletBalanceIcon" aria-hidden="true"><Wallet size={20} /></span><span className="muted">{t('WALLET BALANCE')}</span><strong>{money(walletBalance,currency)}</strong><p className="muted">{t('Wallet credit can be used with Wallet checkout.')}</p></div>
      <div className="card walletBalance"><span className="walletBalanceIcon" aria-hidden="true"><Coins size={20} /></span><span className="muted">{t('COINS')}</span><strong>{coinBalance.toLocaleString()}</strong><p className="muted">{t('1 coin = 0.01 in store currency when redeemed at checkout.')}</p></div>
    </div>
    <div className="grid twoColumn walletActivity">
      <section className="card"><div className="sectionHead small"><h2 className="accountTitle">{t('Wallet activity')}</h2><span className="muted">{t('{n} recent', { n: walletTransactions.length })}</span></div>{!walletTransactions.length?<p className="muted">{t('No wallet activity yet.')}</p>:<ul className="walletEntries">{walletTransactions.map(tx=>entry(tx, WALLET_LABELS[tx.type] ? t(WALLET_LABELS[tx.type]) : plainWords(tx.type), money(tx.amount,tx.currency)))}</ul>}</section>
      <section className="card"><div className="sectionHead small"><h2 className="accountTitle">{t('Coin activity')}</h2><span className="muted">{t('{n} recent', { n: coinTransactions.length })}</span></div>{!coinTransactions.length?<p className="muted">{t('No coin activity yet.')}</p>:<ul className="walletEntries">{coinTransactions.map(tx=>entry(tx, COIN_LABELS[tx.type] ? t(COIN_LABELS[tx.type]) : plainWords(tx.type), tx.amount.toLocaleString()))}</ul>}</section>
    </div>
  </div></main><StoreFooter /></>
}
