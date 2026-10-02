import AdminLoginForm from '@/app/admin/login/admin-login-form'
import { getLoginBrand } from '@/app/admin/login/login-brand'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  return <AdminLoginForm brand={await getLoginBrand()} />
}
