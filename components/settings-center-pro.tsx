'use client'

import { useEffect, useMemo, useState } from 'react'
import { Save, Store, CreditCard, Truck, Globe2, Mail, ShieldCheck, Search, Bell, Code2, ChevronRight } from 'lucide-react'
import styles from './admin-settings-center.module.css'
import ui from './admin-ui.module.css'

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

type PaymentConfig = {
  provider: string
  enabled: boolean
  merchantId: string
  merchantName: string
  apiBaseUrl: string
  apiVersion: string
  checkoutScriptUrl: string
  hasApiPassword: boolean
  apiPassword: string
}

const defaultPaymentConfig: PaymentConfig = {
  provider: 'manual',
  enabled: false,
  merchantId: '',
  merchantName: '',
  apiBaseUrl: 'https://epayment.areeba.com/api/rest',
  apiVersion: '78',
  checkoutScriptUrl: 'https://epayment.areeba.com/static/checkout/checkout.min.js',
  hasApiPassword: false,
  apiPassword: '',
}

export default function SettingsCenterPro({ initial }: { initial: any[] }) {
  const map = useMemo(() => new Map(initial.map(x => [x.key, x.value])), [initial])
  const [tab, setTab] = useState('General')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    'store.name': map.get('store.name') || 'YOUR BRAND',
    'store.currency': map.get('store.currency') || 'USD',
    'store.country': map.get('store.country') || 'Lebanon',
    'store.timezone': map.get('store.timezone') || 'Asia/Beirut',
    'contact.email': map.get('contact.email') || '',
    'contact.phone': map.get('contact.phone') || '',
    'checkout.freeShippingThreshold': map.get('checkout.freeShippingThreshold') || '100',
    'checkout.taxRatePercent': map.get('checkout.taxRatePercent') || '0',
    'seo.title': map.get('seo.title') || '',
    'seo.description': map.get('seo.description') || '',
  })
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries([
    'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
    'checkout.guestCheckout', 'notifications.orderEmail', 'notifications.lowStock',
    'notifications.reviews', 'email.customerOrder', 'email.fulfillment', 'email.abandonedCheckout',
  ].map(k => [k, map.get(k) !== 'false'])))
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(defaultPaymentConfig)
  const [paymentLoading, setPaymentLoading] = useState(false)

  useEffect(() => {
    if (tab !== 'Payments') return
    setPaymentLoading(true)
    api('/api/admin/payment-provider')
      .then(d => setPaymentConfig({ ...defaultPaymentConfig, ...d, apiPassword: '' }))
      .catch(e => setNotice(e instanceof Error ? e.message : 'Unable to load payment provider settings'))
      .finally(() => setPaymentLoading(false))
  }, [tab])

  const filtered = groups.filter(g => `${g.label} ${g.desc}`.toLowerCase().includes(search.toLowerCase()))
  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }))
  const toggle = (key: string) => setFlags(v => ({ ...v, [key]: !v[key] }))

  async function save() {
    setSaving(true)
    setNotice('')
    try {
      for (const [key, value] of Object.entries(values)) await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) })
      for (const [key, value] of Object.entries(flags)) await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key, value: String(value) }) })
      if (tab === 'Payments') {
        const saved = await api('/api/admin/payment-provider', { method: 'PATCH', body: JSON.stringify(paymentConfig) })
        setPaymentConfig({ ...defaultPaymentConfig, ...saved, apiPassword: '' })
      }
      setNotice('All settings saved')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <span className={`${ui.muted} ${ui.tiny}`}>SETTINGS</span>
          <h1 className={ui.heading}>Settings</h1>
          <p className={ui.muted}>Manage your store from one place.</p>
        </div>
        <div className="inline">
          <div className={styles.search}>
            <Search size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings" />
          </div>
          <button className={`${ui.btn} ${styles.saveBtn}`} onClick={save} disabled={saving || paymentLoading}>
            <Save size={15} />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {notice && <div className={ui.alert} style={{ marginBottom: 14 }}>{notice}</div>}

      <div className={styles.layout}>
        <aside className={styles.nav}>
          {filtered.map(g => {
            const Icon = g.icon
            return (
              <button
                key={g.key}
                className={tab === g.key ? `${styles.navButton} ${styles.navButtonActive}` : styles.navButton}
                onClick={() => setTab(g.key)}
              >
                <Icon size={17} />
                <span className={styles.navText}><strong>{g.label}</strong><small>{g.desc}</small></span>
                <ChevronRight size={15} />
              </button>
            )
          })}
        </aside>

        <main className={styles.main}>
          {tab === 'General' && (
            <Card title="Store details" desc="Basic information used throughout your storefront.">
              <div className={ui.twoCol}>
                <Field label="Store name" value={values['store.name']} onChange={v => set('store.name', v)} />
                <Field label="Currency" value={values['store.currency']} onChange={v => set('store.currency', v.toUpperCase())} />
                <Field label="Country" value={values['store.country']} onChange={v => set('store.country', v)} />
                <Field label="Timezone" value={values['store.timezone']} onChange={v => set('store.timezone', v)} />
                <Field label="Store email" value={values['contact.email']} onChange={v => set('contact.email', v)} />
                <Field label="Phone / WhatsApp" value={values['contact.phone']} onChange={v => set('contact.phone', v)} />
              </div>
            </Card>
          )}

          {tab === 'Payments' && (
            <>
              <Card title="Payment methods" desc="Choose which methods customers can use at checkout.">
                <Toggle label="Cash on delivery" keyName="payment.cod" value={flags['payment.cod']} onChange={() => toggle('payment.cod')} />
                <Toggle label="Online card" keyName="payment.card" value={flags['payment.card']} onChange={() => toggle('payment.card')} />
                <Toggle label="Bank transfer" keyName="payment.bank" value={flags['payment.bank']} onChange={() => toggle('payment.bank')} />
                <Toggle label="Wallet" keyName="payment.wallet" value={flags['payment.wallet']} onChange={() => toggle('payment.wallet')} />
              </Card>

              <Card title="Online payment provider" desc="Connect and switch gateways without changing checkout code.">
                <label className={ui.fieldLabel}>
                  Provider
                  <select className={ui.select} value={paymentConfig.provider} onChange={e => setPaymentConfig(v => ({ ...v, provider: e.target.value }))}>
                    <option value="manual">Manual / no online gateway</option>
                    <option value="areeba_mpgs">Areeba Hosted Checkout (MPGS)</option>
                  </select>
                </label>
                <div className={ui.twoCol}>
                  <Field label="Merchant ID" value={paymentConfig.merchantId} onChange={v => setPaymentConfig(c => ({ ...c, merchantId: v }))} />
                  <Field label="Merchant name" value={paymentConfig.merchantName} onChange={v => setPaymentConfig(c => ({ ...c, merchantName: v }))} />
                  <Field label="Gateway API base URL" value={paymentConfig.apiBaseUrl} onChange={v => setPaymentConfig(c => ({ ...c, apiBaseUrl: v }))} />
                  <Field label="API version" value={paymentConfig.apiVersion} onChange={v => setPaymentConfig(c => ({ ...c, apiVersion: v }))} />
                  <Field label="Checkout script URL" value={paymentConfig.checkoutScriptUrl} onChange={v => setPaymentConfig(c => ({ ...c, checkoutScriptUrl: v }))} />
                  <label className={ui.fieldLabel}>
                    API password
                    <input
                      className={ui.input}
                      type="password"
                      value={paymentConfig.apiPassword}
                      onChange={e => setPaymentConfig(c => ({ ...c, apiPassword: e.target.value }))}
                      placeholder={paymentConfig.hasApiPassword ? 'Saved — leave blank to keep it' : 'Enter gateway API password'}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <div className={styles.securityCallout}>
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Gateway secret protected</strong>
                    <p className={ui.muted}>The API password is encrypted before it is stored and is never returned to the admin UI.</p>
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === 'Shipping' && (
            <Card title="Shipping & delivery" desc="Configure checkout defaults; detailed rates are managed in Shipping.">
              <div className={ui.twoCol}>
                <Field label="Free shipping threshold" value={values['checkout.freeShippingThreshold']} onChange={v => set('checkout.freeShippingThreshold', v)} />
                <Field label="Default tax rate (%)" value={values['checkout.taxRatePercent']} onChange={v => set('checkout.taxRatePercent', v)} />
              </div>
              <Toggle label="Guest checkout" keyName="checkout.guestCheckout" value={flags['checkout.guestCheckout']} onChange={() => toggle('checkout.guestCheckout')} />
            </Card>
          )}

          {tab === 'Markets' && (
            <Card title="Markets & localization" desc="Set your primary market and defaults.">
              <div className={styles.marketSummary}>
                <div className={styles.marketItem}><span>Primary market</span><strong>{values['store.country']}</strong></div>
                <div className={styles.marketItem}><span>Currency</span><strong>{values['store.currency']}</strong></div>
                <div className={styles.marketItem}><span>Timezone</span><strong>{values['store.timezone']}</strong></div>
              </div>
            </Card>
          )}

          {tab === 'Notifications' && (
            <Card title="Operational notifications" desc="Choose which internal events should alert your team.">
              <Toggle label="New order notifications" keyName="notifications.orderEmail" value={flags['notifications.orderEmail']} onChange={() => toggle('notifications.orderEmail')} />
              <Toggle label="Low stock alerts" keyName="notifications.lowStock" value={flags['notifications.lowStock']} onChange={() => toggle('notifications.lowStock')} />
              <Toggle label="Review moderation alerts" keyName="notifications.reviews" value={flags['notifications.reviews']} onChange={() => toggle('notifications.reviews')} />
            </Card>
          )}

          {tab === 'Email' && (
            <Card title="Customer email events" desc="Control automated customer messaging. Provider credentials are configured separately.">
              <Toggle label="Order confirmation" keyName="email.customerOrder" value={flags['email.customerOrder']} onChange={() => toggle('email.customerOrder')} />
              <Toggle label="Fulfillment / tracking" keyName="email.fulfillment" value={flags['email.fulfillment']} onChange={() => toggle('email.fulfillment')} />
              <Toggle label="Abandoned checkout recovery" keyName="email.abandonedCheckout" value={flags['email.abandonedCheckout']} onChange={() => toggle('email.abandonedCheckout')} />
            </Card>
          )}

          {tab === 'Security' && (
            <Card title="Security & access" desc="Staff access is enforced server-side with permissions and audit logging.">
              <div className={styles.securityCallout}>
                <ShieldCheck size={20} />
                <div>
                  <strong>Protected admin access</strong>
                  <p className={ui.muted}>Passwords are hashed, inactive staff are blocked, and admin mutations require permissions.</p>
                </div>
              </div>
              <a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/users">Manage users &amp; roles</a>
            </Card>
          )}

          {tab === 'Custom data' && (
            <Card title="Custom data" desc="Create structured fields for products and other commerce entities.">
              <p className={ui.muted}>Custom definitions remain available from the dedicated Metafields manager and product editor.</p>
              <a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/metafields">Open metafields</a>
            </Card>
          )}
        </main>
      </div>
    </div>
  )
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className={`${ui.card} ${styles.card}`}>
      <header className={styles.cardHead}>
        <div>
          <h2>{title}</h2>
          <p className={ui.muted}>{desc}</p>
        </div>
      </header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={ui.fieldLabel}>
      {label}
      <input className={ui.input} value={value || ''} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

function Toggle({ label, keyName, value, onChange }: { label: string; keyName: string; value: boolean; onChange: () => void }) {
  return (
    <div className={styles.toggle}>
      <div className={styles.toggleInfo}>
        <strong>{label}</strong>
        <small>{keyName}</small>
      </div>
      <button
        type="button"
        aria-label={label}
        className={value ? `${styles.toggleSwitch} ${styles.toggleSwitchOn}` : styles.toggleSwitch}
        onClick={onChange}
      >
        <i />
      </button>
    </div>
  )
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}
