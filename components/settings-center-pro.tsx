'use client'

import { useMemo, useState } from 'react'
import { Save, Store, CreditCard, Truck, Globe2, Mail, ShieldCheck, Search, Bell, Code2, ChevronRight } from 'lucide-react'

const groups = [
  { key: 'General', label: 'General', icon: Store, desc: 'Store identity and regional defaults' },
  { key: 'Payments', label: 'Payments', icon: CreditCard, desc: 'Payment methods and checkout status' },
  { key: 'Shipping', label: 'Shipping & delivery', icon: Truck, desc: 'Shipping defaults and checkout behavior' },
  { key: 'Markets', label: 'Markets', icon: Globe2, desc: 'Currency and localization' },
  { key: 'Notifications', label: 'Notifications', icon: Bell, desc: 'Order and operational alerts' },
  { key: 'Email', label: 'Email & messaging', icon: Mail, desc: 'Customer communication preferences' },
  { key: 'Security', label: 'Security & access', icon: ShieldCheck, desc: 'Staff access and account protection' },
  { key: 'Custom data', label: 'Custom data', icon: Code2, desc: 'Metafields and structured data' },
]

export default function SettingsCenterPro({ initial }: { initial: any[] }) {
  const map = useMemo(() => new Map(initial.map(x => [x.key, x.value])), [initial])
  const [tab, setTab] = useState('General')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    'store.name': map.get('store.name') || 'YOUR BRAND', 'store.currency': map.get('store.currency') || 'USD',
    'store.country': map.get('store.country') || 'Lebanon', 'store.timezone': map.get('store.timezone') || 'Asia/Beirut',
    'contact.email': map.get('contact.email') || '', 'contact.phone': map.get('contact.phone') || '',
    'checkout.freeShippingThreshold': map.get('checkout.freeShippingThreshold') || '100', 'checkout.taxRatePercent': map.get('checkout.taxRatePercent') || '0',
    'seo.title': map.get('seo.title') || '', 'seo.description': map.get('seo.description') || '',
  })
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries([
    'payment.cod','payment.card','payment.bank','payment.wallet','checkout.guestCheckout','notifications.orderEmail','notifications.lowStock','notifications.reviews','email.customerOrder','email.fulfillment','email.abandonedCheckout'
  ].map(k => [k, map.get(k) !== 'false'])))

  const filtered = groups.filter(g => `${g.label} ${g.desc}`.toLowerCase().includes(search.toLowerCase()))
  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }))
  const toggle = (key: string) => setFlags(v => ({ ...v, [key]: !v[key] }))

  async function save() {
    setSaving(true); setNotice('')
    try {
      for (const [key, value] of Object.entries(values)) await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) })
      for (const [key, value] of Object.entries(flags)) await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key, value: String(value) }) })
      setNotice('All settings saved')
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to save settings') }
    finally { setSaving(false) }
  }

  return <div className="settingsPro">
    <style jsx>{`.settingsPro{max-width:1180px;margin:0 auto}.settingsProHead{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:22px}.settingsSearch{width:260px;height:42px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:#fff}.settingsSearch input{border:0;outline:0;flex:1;min-width:0}.settingsProLayout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:20px;align-items:start}.settingsProNav{display:grid;gap:4px;position:sticky;top:24px}.settingsProNav button{display:grid;grid-template-columns:22px 1fr 16px;align-items:center;gap:8px;width:100%;padding:11px 12px;border:1px solid transparent;background:transparent;border-radius:10px;color:#555;text-align:left;cursor:pointer}.settingsProNav button:hover{background:#fff;border-color:var(--line)}.settingsProNav button.active{background:#fff;border-color:var(--line);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.03)}.settingsProNav span{display:grid;gap:2px}.settingsProNav strong{font-size:13px}.settingsProNav small{font-size:11px;color:var(--muted);line-height:1.25}.settingsProMain{display:grid;gap:18px}.settingsProCard{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}.settingsProCard header{padding:20px;border-bottom:1px solid var(--line)}.settingsProCard h2{margin:0;font-size:18px}.settingsProCard header p{margin:5px 0 0;font-size:13px}.settingsProBody{padding:20px;display:grid;gap:18px}.settingsToggle{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:14px 0;border-bottom:1px solid var(--line)}.settingsToggle:last-child{border-bottom:0}.settingsToggle>div{display:grid;gap:3px}.settingsToggle strong{font-size:14px}.settingsToggle small{color:var(--muted);font-size:11px}.settingsToggle button{width:44px;height:24px;border:0;border-radius:999px;background:#c8c8c8;padding:3px;cursor:pointer;transition:.18s}.settingsToggle button i{display:block;width:18px;height:18px;border-radius:50%;background:#fff;transition:.18s}.settingsToggle button.on{background:#1c7d45}.settingsToggle button.on i{transform:translateX(20px)}.marketSummary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.marketSummary>div{padding:16px;border:1px solid var(--line);border-radius:12px;display:grid;gap:4px}.marketSummary span{font-size:12px;color:var(--muted)}.securityCallout{display:flex;gap:12px;padding:16px;border:1px solid #dfe8e2;background:#f5faf6;border-radius:12px}.securityCallout p{margin:4px 0 0}@media(max-width:800px){.settingsProHead{align-items:stretch;flex-direction:column}.settingsProLayout{grid-template-columns:1fr}.settingsProNav{position:static;display:flex;overflow:auto;padding-bottom:4px}.settingsProNav button{min-width:220px}.settingsSearch{width:100%}.marketSummary{grid-template-columns:1fr}.settingsProHead .inline{align-items:stretch}.settingsProHead .btn{width:100%}}`}</style>
    <div className="settingsProHead"><div><span className="muted tiny">SETTINGS</span><h1 className="h2">Settings</h1><p className="muted">Manage your store from one place.</p></div><div className="inline"><div className="settingsSearch"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings"/></div><button className="btn" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save'}</button></div></div>
    {notice && <div className="alert" style={{ marginBottom: 14 }}>{notice}</div>}
    <div className="settingsProLayout">
      <aside className="settingsProNav">{filtered.map(g => { const Icon=g.icon; return <button key={g.key} className={tab===g.key?'active':''} onClick={()=>setTab(g.key)}><Icon size={17}/><span><strong>{g.label}</strong><small>{g.desc}</small></span><ChevronRight size={15}/></button> })}</aside>
      <main className="settingsProMain">
        {tab==='General' && <Card title="Store details" desc="Basic information used throughout your storefront."><div className="twoColFields"><Field label="Store name" value={values['store.name']} onChange={v=>set('store.name',v)}/><Field label="Currency" value={values['store.currency']} onChange={v=>set('store.currency',v.toUpperCase())}/><Field label="Country" value={values['store.country']} onChange={v=>set('store.country',v)}/><Field label="Timezone" value={values['store.timezone']} onChange={v=>set('store.timezone',v)}/><Field label="Store email" value={values['contact.email']} onChange={v=>set('contact.email',v)}/><Field label="Phone / WhatsApp" value={values['contact.phone']} onChange={v=>set('contact.phone',v)}/></div></Card>}
        {tab==='Payments' && <Card title="Payment methods" desc="Choose which methods customers can use at checkout."><Toggle label="Cash on delivery" keyName="payment.cod" value={flags['payment.cod']} onChange={()=>toggle('payment.cod')} /><Toggle label="Online card" keyName="payment.card" value={flags['payment.card']} onChange={()=>toggle('payment.card')} /><Toggle label="Bank transfer" keyName="payment.bank" value={flags['payment.bank']} onChange={()=>toggle('payment.bank')} /><Toggle label="Wallet" keyName="payment.wallet" value={flags['payment.wallet']} onChange={()=>toggle('payment.wallet')} /></Card>}
        {tab==='Shipping' && <Card title="Shipping & delivery" desc="Configure checkout defaults; detailed rates are managed in Shipping."><div className="twoColFields"><Field label="Free shipping threshold" value={values['checkout.freeShippingThreshold']} onChange={v=>set('checkout.freeShippingThreshold',v)}/><Field label="Default tax rate (%)" value={values['checkout.taxRatePercent']} onChange={v=>set('checkout.taxRatePercent',v)}/></div><Toggle label="Guest checkout" keyName="checkout.guestCheckout" value={flags['checkout.guestCheckout']} onChange={()=>toggle('checkout.guestCheckout')} /></Card>}
        {tab==='Markets' && <Card title="Markets & localization" desc="Set your primary market and defaults."><div className="marketSummary"><div><span>Primary market</span><strong>{values['store.country']}</strong></div><div><span>Currency</span><strong>{values['store.currency']}</strong></div><div><span>Timezone</span><strong>{values['store.timezone']}</strong></div></div></Card>}
        {tab==='Notifications' && <Card title="Operational notifications" desc="Choose which internal events should alert your team."><Toggle label="New order notifications" keyName="notifications.orderEmail" value={flags['notifications.orderEmail']} onChange={()=>toggle('notifications.orderEmail')} /><Toggle label="Low stock alerts" keyName="notifications.lowStock" value={flags['notifications.lowStock']} onChange={()=>toggle('notifications.lowStock')} /><Toggle label="Review moderation alerts" keyName="notifications.reviews" value={flags['notifications.reviews']} onChange={()=>toggle('notifications.reviews')} /></Card>}
        {tab==='Email' && <Card title="Customer email events" desc="Control automated customer messaging. Provider credentials are configured separately."><Toggle label="Order confirmation" keyName="email.customerOrder" value={flags['email.customerOrder']} onChange={()=>toggle('email.customerOrder')} /><Toggle label="Fulfillment / tracking" keyName="email.fulfillment" value={flags['email.fulfillment']} onChange={()=>toggle('email.fulfillment')} /><Toggle label="Abandoned checkout recovery" keyName="email.abandonedCheckout" value={flags['email.abandonedCheckout']} onChange={()=>toggle('email.abandonedCheckout')} /></Card>}
        {tab==='Security' && <Card title="Security & access" desc="Staff access is enforced server-side with permissions and audit logging."><div className="securityCallout"><ShieldCheck size={20}/><div><strong>Protected admin access</strong><p className="muted">Passwords are hashed, inactive staff are blocked, and admin mutations require permissions.</p></div></div><a className="btn secondary" href="/admin/users">Manage users & roles</a></Card>}
        {tab==='Custom data' && <Card title="Custom data" desc="Create structured fields for products and other commerce entities."><p className="muted">Custom definitions remain available from the dedicated Metafields manager and product editor.</p><a className="btn secondary" href="/admin/metafields">Open metafields</a></Card>}
      </main>
    </div>
  </div>
}
function Card({title,desc,children}:{title:string;desc:string;children:React.ReactNode}){return <section className="settingsProCard"><header><div><h2>{title}</h2><p className="muted">{desc}</p></div></header><div className="settingsProBody">{children}</div></section>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="fieldLabel">{label}<input className="input" value={value||''} onChange={e=>onChange(e.target.value)}/></label>}
function Toggle({label,keyName,value,onChange}:{label:string;keyName:string;value:boolean;onChange:()=>void}){return <div className="settingsToggle"><div><strong>{label}</strong><small>{keyName}</small></div><button aria-label={label} className={value?'on':''} onClick={onChange}><i/></button></div>}
async function api(path:string,init?:RequestInit){const r=await fetch(path,{...init,headers:{'content-type':'application/json',...(init?.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
