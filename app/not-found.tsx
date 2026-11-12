import Link from 'next/link'
import { Search } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import { getT } from '@/lib/i18n-server'
import styles from './not-found.module.css'

export default async function NotFound() {
  const t = await getT()
  return <>
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="not-found-title">
        <span className={styles.code}>404</span>
        <h1 id="not-found-title" className={styles.title}>{t('Page not found.')}</h1>
        <p className={styles.lead}>{t("The page or product you're looking for may have moved or is no longer available.")}</p>
        <p className={styles.hint}>{t('Try a search, or start from one of these.')}</p>
        <form action="/shop" method="GET" role="search" className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input type="search" name="q" aria-label={t('Search products…')} placeholder={t('Search products…')} />
          <button type="submit">{t('Search')}</button>
        </form>
        <div className={styles.links}>
          <Link className={styles.primary} href="/shop">{t('Shop products')}</Link>
          <Link href="/shop?sort=newest">{t('New arrivals')}</Link>
          <Link href="/orders/lookup">{t('Track your order')}</Link>
          <Link href="/">{t('Home')}</Link>
        </div>
      </section>
    </main>
    <StoreFooter />
  </>
}
