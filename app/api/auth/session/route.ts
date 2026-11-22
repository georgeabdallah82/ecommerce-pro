import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { isPlaceholderEmail } from '@/lib/phone-sign-in'

export async function GET() {
  const user = await getCurrentUser()
  return json(
    { authenticated: Boolean(user), user: user ? { id: user.id, name: user.name, email: isPlaceholderEmail(user.email) ? '' : user.email, phone: user.phone || '', role: user.role } : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
