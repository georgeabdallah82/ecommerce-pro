import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const PRIVATE_PREFIXES = ['push.subscription.']
function isPrivateKey(key: string) { return PRIVATE_PREFIXES.some(prefix => key.startsWith(prefix)) }

export async function GET(){
  try {
    await requirePermission('settings.view')
    return json(await db.setting.findMany({ where: { NOT: { OR: PRIVATE_PREFIXES.map(prefix => ({ key: { startsWith: prefix } })) } }, orderBy:{key:'asc'} }))
  }catch(e){return json({error:e instanceof Error?e.message:'Forbidden'},{status:403})}
}

export async function PATCH(req:Request){
  try{
    const actor=await requirePermission('settings.manage');const b=await req.json();const key=String(b.key||'').trim()
    if(!key)return json({error:'Setting key required'},{status:400})
    if(isPrivateKey(key))return json({error:'Private setting keys cannot be edited here'},{status:403})
    const s=await db.setting.upsert({where:{key},update:{value:String(b.value??'')},create:{key,value:String(b.value??'')}})
    await audit(actor.id,'setting.updated','Setting',s.id,{key});return json({setting:s})
  }catch(e){return json({error:e instanceof Error?e.message:'Unable to update setting'},{status:400})}
}
