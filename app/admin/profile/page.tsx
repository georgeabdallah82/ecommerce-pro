import { requireStaff } from '@/lib/auth'
import AdminProfileForm from '@/components/admin-profile-form'
import v from '@/components/admin-dashboard-v2.module.css'

// Admin > My profile: the signed-in staff member's own name and photo.
export default async function ProfilePage() {
  const user = await requireStaff()
  return <div className={v.page}>
    <header className={v.head}>
      <div>
        <div className={v.eyebrow}>Your account</div>
        <h1 className={v.title}>My profile</h1>
        <p className={v.summary}>Your name and photo are shown to the store team.</p>
      </div>
    </header>
    <AdminProfileForm name={user.name} email={user.email} avatarUrl={user.avatarUrl ?? null} />
  </div>
}
