import { db } from '@/lib/prisma'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { cleanStaffName, MAX_AVATAR_BYTES } from '@/lib/staff-profile'
import { sniffImageType } from '@/lib/review-photos'
import { saveAvatarPhoto } from '@/lib/media-storage'

const noStore = { 'Cache-Control': 'private, no-store' }

// The signed-in staff member's own profile (Admin > My profile).
export async function GET() {
  try {
    const user = await requireStaff()
    return json({ name: user.name, email: user.email, avatarUrl: user.avatarUrl ?? null }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load your profile') }
}

// Changes the signed-in staff member's own name. Recorded in the activity log.
export async function PATCH(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { name?: unknown }
    const parsed = cleanStaffName(body.name)
    if ('error' in parsed) return json({ error: parsed.error }, { status: 400, headers: noStore })
    await db.user.update({ where: { id: user.id }, data: { name: parsed.name } })
    await audit(user.id, 'profile.update', 'User', user.id, { field: 'name' })
    return json({ name: parsed.name }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to save your name') }
}

// Uploads a profile photo for the signed-in staff member: JPEG, PNG or WebP, up to 2 MB.
export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    if (Number(req.headers.get('content-length') || 0) > MAX_AVATAR_BYTES + 64 * 1024) return json({ error: 'This photo is too large (2 MB at most).' }, { status: 413, headers: noStore })
    const form = await req.formData().catch(() => null)
    const file = form?.get('avatar')
    if (!file || typeof file === 'string') return json({ error: 'Choose a photo to upload.' }, { status: 400, headers: noStore })
    if (file.size > MAX_AVATAR_BYTES) return json({ error: 'This photo is too large (2 MB at most).' }, { status: 413, headers: noStore })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImageType(bytes)
    if (!type) return json({ error: 'Please choose a JPG, PNG or WebP photo.' }, { status: 415, headers: noStore })
    const avatarUrl = await saveAvatarPhoto(bytes, type)
    await db.user.update({ where: { id: user.id }, data: { avatarUrl } })
    await audit(user.id, 'profile.update', 'User', user.id, { field: 'photo' })
    return json({ avatarUrl }, { status: 201, headers: noStore })
  } catch (error) { return routeError(error, 'Unable to upload your photo') }
}
