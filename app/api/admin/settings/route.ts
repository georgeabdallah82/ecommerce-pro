import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { cappedJson, LIST_CAP } from '@/lib/admin-list'
import { isAllowedSenderAddress, senderDomain } from '@/lib/email'
import { sealSecret } from '@/lib/two-step'

// push.subscription.*: staff phone notification devices. security.devices.*: the browsers each
// account signed in from (lib/sign-in-alerts.ts); nobody can add one here to dodge the alert.
// The Areeba API password is stored encrypted and only the payment settings screen may write it.
const PRIVATE_PREFIXES = ['push.subscription.', 'security.devices.', 'payment.areeba.apiPassword']
function isPrivateKey(key: string) { return PRIVATE_PREFIXES.some(prefix => key.startsWith(prefix)) }
// Write-only secrets: saved through this route but never sent back to the browser.
const SECRET_KEYS = new Set(['tracking.metaCapiToken', 'whatsapp.cloud.accessToken'])
const MASK = '********'
// Secrets are kept sealed (encrypted with a key derived from AUTH_SECRET, lib/two-step.ts); read back by openSecret.
// Both saves below seal them: before, they were written as typed and stayed readable until the daily job sealed them.
async function storedValue(key:string, value:string){ return SECRET_KEYS.has(key) && value ? sealSecret(value) : value }
const masked = <T extends { key: string; value: string }>(row: T) => SECRET_KEYS.has(row.key) ? { ...row, value: row.value ? MASK : '' } : row
// The mask a screen got back from GET is never saved over the real secret.
const isMaskEcho = (key: string, value: string) => SECRET_KEYS.has(key) && value === MASK

export async function GET(){
  try {
    await requirePermission('settings.view')
    const rows = await db.setting.findMany({ where: { NOT: { OR: PRIVATE_PREFIXES.map(prefix => ({ key: { startsWith: prefix } })) } }, orderBy:{key:'asc'}, take: LIST_CAP + 1 })
    return cappedJson(rows.map(masked), LIST_CAP)
  }catch(e){return routeError(e, 'Forbidden', 403)}
}

// The email sender address must be at the domain verified in Resend (empty = the default).
function invalidSetting(entries: ReadonlyArray<readonly [string, string]>) {
  const address = entries.find(([key]) => key === 'email.fromAddress')?.[1].trim()
  if (!address) return null
  const envFrom = process.env.EMAIL_FROM || ''
  if (isAllowedSenderAddress(address, envFrom)) return null
  const domain = senderDomain(envFrom)
  return domain ? `The sender address must end with @${domain}` : 'Email sending is not set up yet, so the sender address cannot be changed'
}

// Saves one setting ({key, value}) or many at once ({settings: {key: value, ...}}). The Settings
// page sends everything in one request; only values that actually changed are written, in
// parallel, so a save no longer costs one request per field.
export async function PATCH(req:Request){
  try{
    const actor=await requirePermission('settings.manage');const b=await req.json()
    if(b&&typeof b.settings==='object'&&b.settings&&!Array.isArray(b.settings)){
      const entries=Object.entries(b.settings as Record<string,unknown>).map(([k,v])=>[String(k).trim(),String(v??'')] as const).filter(([k,v])=>k&&!isMaskEcho(k,v))
      if(entries.length>200)return json({error:'Too many settings in one save'},{status:400})
      const blocked=entries.find(([k])=>isPrivateKey(k));if(blocked)return json({error:'Private setting keys cannot be edited here'},{status:403})
      const invalid=invalidSetting(entries);if(invalid)return json({error:invalid},{status:400})
      const keys=entries.map(([k])=>k)
      const current=new Map((keys.length?await db.setting.findMany({where:{key:{in:keys}}}):[]).map(row=>[row.key,row.value]))
      const changed=entries.filter(([k,v])=>current.get(k)!==v)
      const saved=await Promise.all(changed.map(async([key,typed])=>{const value=await storedValue(key,typed);return db.setting.upsert({where:{key},update:{value},create:{key,value}})}))
      if(saved.length)await audit(actor.id,'settings.updated','Setting',undefined,{keys:changed.map(([k])=>k)})
      return json({settings:saved.map(masked),changed:saved.length})
    }
    const key=String(b.key||'').trim()
    if(!key)return json({error:'Setting key required'},{status:400})
    if(isPrivateKey(key))return json({error:'Private setting keys cannot be edited here'},{status:403})
    const invalid=invalidSetting([[key,String(b.value??'')]]);if(invalid)return json({error:invalid},{status:400})
    if(isMaskEcho(key,String(b.value??'')))return json({error:'Paste the new value to replace the saved one'},{status:400})
    const value=await storedValue(key,String(b.value??''))
    const s=await db.setting.upsert({where:{key},update:{value},create:{key,value}})
    await audit(actor.id,'setting.updated','Setting',s.id,{key});return json({setting:masked(s)})
  }catch(e){return routeError(e, 'Unable to update setting', 400)}
}
