import AdminLoginForm from './admin-login-form'
import { getLoginBrand } from './login-brand'

export default async function AdminLoginPage() {
  return <AdminLoginForm brand={await getLoginBrand()} />
}
