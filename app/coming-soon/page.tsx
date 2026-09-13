import { getThemeState } from '@/lib/theme'
import { getMaintenanceConfig } from '@/lib/maintenance'
import { config } from '@/lib/config'
import { CountdownTimer } from '@/components/countdown-timer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ComingSoon() {
  const [{ theme }, maintenance] = await Promise.all([getThemeState(), getMaintenanceConfig()])
  const brand = theme.brandName || config.brand

  return (
    <div className="aliComingSoon">
      <div className="aliComingSoonInner">
        <div className="aliComingSoonBrand">{brand}</div>
        <h1>{maintenance.headline}</h1>
        <p>{maintenance.message}</p>
        <CountdownTimer launchAt={maintenance.launchAt} />
        {config.whatsapp && (
          <a className="aliComingSoonContact" href={`https://wa.me/${config.whatsapp.replace(/[^\d+]/g, '')}`} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
