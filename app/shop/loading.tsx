// Shown at once while the shop page loads (a search, a filter, the next page), so the shopper
// sees the grid coming instead of a frozen page. Grey shapes, and one line for screen readers;
// the shop never calls notFound(), so streaming early keeps its status codes right.
import { getT } from '@/lib/i18n-server'

export default async function ShopLoading() {
  const t = await getT()
  return (
    <div className="focalStorefront aliShopPage shopSkeleton" aria-busy="true" aria-live="polite">
      <span className="srOnly">{t('Loading products…')}</span>
      <div className="aliContainer">
        <div className="skelBar skelSearch" />
        <div className="skelGrid">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="skelCard" key={i}>
              <div className="skelBox" />
              <div className="skelBar" />
              <div className="skelBar short" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
