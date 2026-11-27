import { requireStaff } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { permissionsFor } from '@/lib/permissions'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreCurrency } from '@/lib/store-currency'
import { getStoreTimezone } from '@/lib/store-timezone'
import { configuredSiteUrl } from '@/lib/site-url'
import { fcmConfigured } from '@/lib/fcm'

const noStore = { 'Cache-Control': 'private, no-store' }

// Who is signed in to the Android admin app, what they may do there, and the store's basics
// (name, currency, time zone). The app hides what the person's permissions don't allow; the
// server checks every request again regardless.
export async function GET() {
  try {
    const user = await requireStaff()
    const [store, currency, timezone] = await Promise.all([getStoreIdentity(), getStoreCurrency(), getStoreTimezone()])
    return json({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatarUrl: user.avatarUrl, twoStepOn: !!user.totpEnabledAt, lastLoginAt: user.lastLoginAt, permissions: user.permissions ?? permissionsFor(user.role) },
      store: { name: store.name, country: store.country, currency, timezone, siteUrl: configuredSiteUrl() || '' },
      pushConfigured: fcmConfigured(),
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load your account', 400, noStore) }
}
