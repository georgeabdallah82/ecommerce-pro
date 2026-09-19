import { getThemeState } from '@/lib/theme'
import { getMaintenanceConfig } from '@/lib/maintenance'
import { config } from '@/lib/config'
import { getContactInfo } from '@/lib/store-contact'
import { CountdownTimer } from '@/components/countdown-timer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ComingSoon() {
  const [{ theme }, maintenance, contact] = await Promise.all([getThemeState(), getMaintenanceConfig(), getContactInfo()])
  const brand = theme.brandName || config.brand

  return (
    <div className="aliComingSoon">
      <div className="aliComingSoonInner">
        <div className="aliComingSoonBrand">{brand}</div>
        <h1>{maintenance.headline}</h1>
        <p>{maintenance.message}</p>
        <CountdownTimer launchAt={maintenance.launchAt} />
        {contact.phone && (
          <a className="aliComingSoonContact" href={`https://wa.me/${contact.phone.replace(/[^\d+]/g, '')}`} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
