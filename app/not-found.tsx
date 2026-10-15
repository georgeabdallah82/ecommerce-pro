import Link from 'next/link'
import { StoreFooter } from '@/components/store-footer'
import { getT } from '@/lib/i18n-server'
export default async function NotFound(){
  const t = await getT()
return <><main className="section"><div className="container"><div className="card empty"><span className="muted">404</span><h1 className="h2">{t('Page not found.')}</h1><p className="muted">{t("The page or product you're looking for may have moved or is no longer available.")}</p><div className="inline" style={{justifyContent:'center'}}><Link className="btn" href="/shop">{t('Shop products')}</Link><Link className="btn secondary" href="/">{t('Home')}</Link></div></div></div></main><StoreFooter /></>}
