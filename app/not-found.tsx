import Link from 'next/link'
import { Search } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import { CategoryIcon } from '@/components/storefront-sections'
import { getT } from '@/lib/i18n-server'
import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'
import styles from './not-found.module.css'

// The shop's categories, so a visitor who followed a dead link can carry on browsing. If the read fails, the page
// still renders, just without the row.
async function shopCategories() {
  try {
    return await storefrontCached('not-found-categories', () => db.collection.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true, imageUrl: true }, orderBy: { sortOrder: 'asc' }, take: 8 }))
  } catch {
    return []
  }
}

export default async function NotFound() {
  const [t, categories] = await Promise.all([getT(), shopCategories()])
  return <>
    <main className={styles.page}>
      <section className={styles.intro} aria-labelledby="not-found-title">
        <h1 id="not-found-title" className={styles.title}>{t('Page not found.')}</h1>
        <p className={styles.lead}>{t("The page or product you're looking for may have moved or is no longer available.")}</p>
        <form action="/shop" method="GET" role="search" className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input type="search" name="q" aria-label={t('Search products…')} placeholder={t('Search products…')} />
          <button type="submit">{t('Search')}</button>
        </form>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/shop">{t('Shop products')}</Link>
          <Link className={styles.secondary} href="/orders/lookup">{t('Track your order')}</Link>
        </div>
      </section>
      {categories.length > 0 && (
        <section className="aliCategoryStrip" aria-labelledby="not-found-categories">
          <div className="mkWrap mkHead mkStripHead"><h2 id="not-found-categories">{t('Shop by category')}</h2></div>
          <div className="aliContainer aliCategoryRow">
            {categories.map(c => <Link key={c.id} href={`/shop?collection=${encodeURIComponent(c.slug)}`} className="aliCategoryItem"><CategoryIcon name={c.name} src={c.imageUrl || undefined} /><span>{c.name}</span></Link>)}
          </div>
        </section>
      )}
    </main>
    <StoreFooter />
  </>
}
