import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET(){
  const user=await getCurrentUser()
  return json({authenticated:Boolean(user),user:user?{id:user.id,name:user.name,email:user.email,role:user.role}:null})
}
