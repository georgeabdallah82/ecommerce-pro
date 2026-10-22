'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Store, CreditCard, Truck, Globe2, Mail, ShieldCheck, Search, Bell, Code2, ChevronRight, BarChart3, Wrench, Gift } from 'lucide-react'
import { MAINTENANCE_DEFAULTS, maintenanceText } from '@/lib/maintenance-defaults'
import styles from './admin-settings-center.module.css'
import ui from './admin-ui.module.css'
import MediaPicker from './media-picker'
import AppIconCard from './app-icon-card'
import TwoStepCard from './two-step-card'
import SignInAlertsCard from './sign-in-alerts-card'
import { REGION_CODES, countryName, deliveryCountries } from '@/lib/delivery-countries'
import { POLICY_DEFAULTS } from '@/lib/policy-defaults'

const groups = [
  { key: 'General', label: 'General', icon: Store, desc: 'Store identity and regional defaults' },
  { key: 'Payments', label: 'Payments', icon: CreditCard, desc: 'Payment methods and checkout status' },
  { key: 'Shipping', label: 'Shipping & delivery', icon: Truck, desc: 'Shipping defaults and checkout behavior' },
  { key: 'Markets', label: 'Markets', icon: Globe2, desc: 'Currency and localization' },
  { key: 'Selling', label: 'Selling tools', icon: Gift, desc: 'Free gift, gift option, cancel an order, welcome discount, invite a friend, questions, WhatsApp button, search words' },
  { key: 'Notifications', label: 'Notifications', icon: Bell, desc: 'Order and operational alerts' },
  { key: 'Email', label: 'Email & messaging', icon: Mail, desc: 'Customer communication preferences' },
  { key: 'Security', label: 'Security & access', icon: ShieldCheck, desc: 'Staff access and account protection' },
  { key: 'Tracking', label: 'Tracking & pixels', icon: BarChart3, desc: 'Facebook/Meta, Google Analytics, and TikTok pixels' },
  { key: 'Maintenance', label: 'Maintenance mode', icon: Wrench, desc: 'Close the store for customers with a maintenance page' },
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

export default function SettingsCenterPro({ initial, metaCapiTokenSet = false, emailFromDefault = '', appIcon, products = [], whatsappListCount = 0 }: { initial: any[]; metaCapiTokenSet?: boolean; emailFromDefault?: string; appIcon?: { brandName: string; source: string; brandColor: string; saved: { large: string; small: string } }; products?: Array<{ id: string; name: string }>; whatsappListCount?: number }) {
  const map = useMemo(() => new Map(initial.map(x => [x.key, x.value])), [initial])
  const [tab, setTab] = useState('General')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [shareImageOpen, setShareImageOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({
    'store.name': map.get('store.name') || 'YOUR BRAND',
    'store.currency': map.get('store.currency') || 'USD',
    'store.country': map.get('store.country') || 'Lebanon',
    'store.timezone': map.get('store.timezone') || 'Asia/Beirut',
    'contact.email': map.get('contact.email') || '',
    'contact.phone': map.get('contact.phone') || '',
    'email.fromName': map.get('email.fromName') || '',
    'email.fromAddress': map.get('email.fromAddress') || '',
    'notifications.summaryEmail': map.get('notifications.summaryEmail') || '',
    'currency.lbpRate': map.get('currency.lbpRate') || '',
    'freeGift.threshold': map.get('freeGift.threshold') || '',
    'freeGift.productId': map.get('freeGift.productId') || '',
    'welcome.code': map.get('welcome.code') || '',
    'welcome.title': map.get('welcome.title') || '',
    'welcome.delaySeconds': map.get('welcome.delaySeconds') || '8',
    'search.synonyms': map.get('search.synonyms') || '',
    'product.lowStockThreshold': map.get('product.lowStockThreshold') || '',
    'invite.friendPercent': map.get('invite.friendPercent') || '10',
    'invite.reward': map.get('invite.reward') || '5',
    'invite.rewardDays': map.get('invite.rewardDays') || '60',
    'orders.guestCancel.minutes': map.get('orders.guestCancel.minutes') || '30',
    'store.address': map.get('store.address') || '',
    'policy.returnDays': map.get('policy.returnDays') || POLICY_DEFAULTS.returnDays,
    'policy.refundTime': map.get('policy.refundTime') || POLICY_DEFAULTS.refundTime,
    'policy.damageReportHours': map.get('policy.damageReportHours') || POLICY_DEFAULTS.damageReportHours,
    'checkout.freeShippingThreshold': map.get('checkout.freeShippingThreshold') || '100',
    'checkout.taxRatePercent': map.get('checkout.taxRatePercent') || '0',
    'seo.title': map.get('seo.title') || '',
    'seo.description': map.get('seo.description') || '',
    'seo.image': map.get('seo.image') || '',
    'tracking.metaPixelId': map.get('tracking.metaPixelId') || '',
    'tracking.gaMeasurementId': map.get('tracking.gaMeasurementId') || '',
    'tracking.tiktokPixelId': map.get('tracking.tiktokPixelId') || '',
    'tracking.metaCapiTestCode': map.get('tracking.metaCapiTestCode') || '',
    'maintenance.headline': maintenanceText(map.get('maintenance.headline'), MAINTENANCE_DEFAULTS.headline),
    'maintenance.message': maintenanceText(map.get('maintenance.message'), MAINTENANCE_DEFAULTS.message),
    'maintenance.backBy': map.get('maintenance.backBy') || '',
  })
  const savedPolicy = useRef<Record<string, string>>(values)
  // The Conversions API token is write-only: typed in to save or replace it, never shown back.
  const [capiToken, setCapiToken] = useState('')
  const [capiTokenSaved, setCapiTokenSaved] = useState(metaCapiTokenSet)
  const [capiCheck, setCapiCheck] = useState('')
  const defaultSender = useMemo(() => {
    const match = /^\s*(.*?)\s*<\s*([^<>\s]+)\s*>\s*$/.exec(emailFromDefault)
    const address = (match ? match[2] : emailFromDefault).trim()
    return { name: match ? match[1].replace(/^"|"$/g, '').trim() : '', address, domain: address.split('@')[1] || '' }
  }, [emailFromDefault])
  const [flags, setFlags] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries([
      'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
      'checkout.guestCheckout', 'notifications.orderEmail', 'notifications.lowStock',
      'notifications.reviews', 'notifications.security', 'notifications.dailySummary', 'notifications.weeklyReport', 'email.customerOrder', 'email.fulfillment', 'email.abandonedCheckout', 'email.giftCard', 'email.returnStatus', 'email.orderEdit', 'email.reviewRequest',
      'checkout.giftOption', 'product.whatsappOrder', 'product.questions', 'orders.guestCancel.enabled',
    ].map(k => [k, map.get(k) !== 'false'])),
    // Off until switched on.
    ...Object.fromEntries(['currency.showLbp', 'freeGift.enabled', 'welcome.enabled', 'invite.enabled'].map(k => [k, map.get(k) === 'true'])),
    'maintenance.enabled': map.get('maintenance.enabled') === 'true',
  }))
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
      // One request for everything; the server writes only what changed.
      const settings: Record<string, string> = { ...values, ...Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, String(value)])) }
      // The policy pages show "Last updated"; move it forward only when their wording changed.
      const policyKeys = ['store.address', 'contact.email', 'contact.phone', 'store.country', 'policy.returnDays', 'policy.refundTime', 'policy.damageReportHours']
      const policyChanged = policyKeys.some(key => (values[key] || '') !== (savedPolicy.current[key] || ''))
      if (policyChanged) settings['policy.updatedAt'] = new Date().toISOString()
      if (capiToken.trim()) settings['tracking.metaCapiToken'] = capiToken.trim()
      const [, savedPayment] = await Promise.all([
        api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings }) }),
        tab === 'Payments' ? api('/api/admin/payment-provider', { method: 'PATCH', body: JSON.stringify(paymentConfig) }) : Promise.resolve(null),
      ])
      if (policyChanged) savedPolicy.current = { ...values }
      if (savedPayment) setPaymentConfig({ ...defaultPaymentConfig, ...savedPayment, apiPassword: '' })
      if (capiToken.trim()) { setCapiTokenSaved(true); setCapiToken('') }
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
        {/* Phones: one dropdown for all settings sections instead of a sideways-scrolling row of cards. */}
        <label className={styles.navSelect}>
          <span>Section</span>
          <select className={ui.input} value={tab} onChange={e => setTab(e.target.value)}>
            {(filtered.some(g => g.key === tab) ? filtered : [...groups.filter(g => g.key === tab), ...filtered]).map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
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
            <>
              <Card title="Store details" desc="Basic information used throughout your storefront.">
                <div className={ui.twoCol}>
                  <Field label="Store name" value={values['store.name']} onChange={v => set('store.name', v)} />
                  <Field label="Currency" value={values['store.currency']} onChange={v => set('store.currency', v.toUpperCase())} />
                  <Field label="Country" value={values['store.country']} onChange={v => set('store.country', v)} />
                  <Field label="Timezone" value={values['store.timezone']} onChange={v => set('store.timezone', v)} />
                  <Field label="Store email" value={values['contact.email']} onChange={v => set('contact.email', v)} />
                  <Field label="Phone / WhatsApp" value={values['contact.phone']} onChange={v => set('contact.phone', v)} />
                </div>
                <Field label="Business address" value={values['store.address']} onChange={v => set('store.address', v)} />
                <span className={ui.fieldHelp}>Shown under "Contact us" on your Privacy, Terms and Refund pages. Leave empty to show only email and WhatsApp.</span>
              </Card>

              <Card title="Policies" desc="Used in the wording of your Refund Policy page. Customers see these exact values.">
                <div className={ui.twoCol}>
                  <Field label="Return window (days)" value={values['policy.returnDays']} onChange={v => set('policy.returnDays', v.replace(/\D/g, ''))} />
                  <Field label="Report damaged items within (hours)" value={values['policy.damageReportHours']} onChange={v => set('policy.damageReportHours', v.replace(/\D/g, ''))} />
                  <Field label="Refunds arrive within" value={values['policy.refundTime']} onChange={v => set('policy.refundTime', v)} />
                </div>
                <span className={ui.fieldHelp}>To rewrite a policy, or to stop accepting returns, go to <a className={ui.textLink} href="/admin/online-store/policies">Online Store › Policies</a>.</span>
              </Card>

              <Card title="Search engine listing" desc="Title and description shown by Google and social previews for your homepage and any page that doesn't set its own.">
                <Field label="SEO title" value={values['seo.title']} onChange={v => set('seo.title', v)} />
                <label className={ui.fieldLabel}>
                  SEO description
                  <textarea className={ui.textarea} rows={3} value={values['seo.description'] || ''} onChange={e => set('seo.description', e.target.value)} />
                </label>
                <div className={ui.fieldLabel}>
                  Share image
                  <span className={ui.fieldHelp}>Shown when someone shares your store link on WhatsApp, Instagram or Facebook. Use a JPG or PNG (not SVG), ideally 1200 × 630. If empty, your homepage banner or first product photo is used.</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setShareImageOpen(true)}>{values['seo.image'] ? 'Change image' : 'Choose image'}</button>
                    {values['seo.image'] && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => set('seo.image', '')}>Remove</button>}
                  </div>
                </div>
                <div className={styles.sharePreview} aria-label="Share preview">
                  {values['seo.image'] ? <img src={values['seo.image']} alt="" /> : <div className={styles.sharePreviewEmpty}>Homepage banner or first product photo</div>}
                  <div>
                    <strong>{values['seo.title'] || values['store.name']}</strong>
                    <span>{values['seo.description'] || `Shop ${values['store.name']} online. Fast delivery and easy returns.`}</span>
                  </div>
                </div>
                <MediaPicker open={shareImageOpen} onClose={() => setShareImageOpen(false)} onAdd={images => { if (images[0]) set('seo.image', images[0].url); setShareImageOpen(false) }} />
              </Card>

              {appIcon && (
                <Card title="Phone app" desc="The icon and name customers see when they add your store to their phone's home screen.">
                  <AppIconCard brandName={appIcon.brandName || values['store.name']} source={appIcon.source} saved={appIcon.saved} brandColor={appIcon.brandColor} />
                </Card>
              )}
            </>
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
            <>
            <Card title="Shipping & delivery" desc="Configure checkout defaults; detailed shipping rates are managed in Shipping and per-country tax rates in Tax.">
              <div className={ui.twoCol}>
                <Field label="Free shipping threshold" value={values['checkout.freeShippingThreshold']} onChange={v => set('checkout.freeShippingThreshold', v)} />
                <Field label="Default tax rate (%)" value={values['checkout.taxRatePercent']} onChange={v => set('checkout.taxRatePercent', v)} />
              </div>
              <p className={ui.muted}>The default tax rate above applies only when no Tax rate zone matches the customer's country.</p>
              <Toggle label="Guest checkout" keyName="checkout.guestCheckout" value={flags['checkout.guestCheckout']} onChange={() => toggle('checkout.guestCheckout')} />
            </Card>
            <DeliveryCountriesCard value={values['checkout.countries']} storeCountry={values['store.country']} onChange={v => set('checkout.countries', v)} />
            </>
          )}

          {tab === 'Markets' && (
            <>
            <Card title="Markets & localization" desc="Set your primary market and defaults.">
              <div className={styles.marketSummary}>
                <div className={styles.marketItem}><span>Primary market</span><strong>{values['store.country']}</strong></div>
                <div className={styles.marketItem}><span>Currency</span><strong>{values['store.currency']}</strong></div>
                <div className={styles.marketItem}><span>Timezone</span><strong>{values['store.timezone']}</strong></div>
              </div>
            </Card>
            <Card title="Prices in Lebanese pounds" desc="Show an approximate LBP amount under prices and totals. Customers still pay the price in your store currency.">
              <Toggle label="Show prices in LBP too" keyName="currency.showLbp" value={flags['currency.showLbp']} onChange={() => toggle('currency.showLbp')} />
              <Field label="Rate: LBP for $1" value={values['currency.lbpRate']} placeholder="e.g. 89500" onChange={v => set('currency.lbpRate', v.replace(/[^\d]/g, ''))} />
            </Card>
            </>
          )}

          {tab === 'Selling' && (
            <>
            <Card title="Free gift above an amount" desc="Orders that reach the amount get the gift product free, while it is in stock. Shoppers see how far they are in the cart.">
              <Toggle label="Give a free gift" keyName="freeGift.enabled" value={flags['freeGift.enabled']} onChange={() => toggle('freeGift.enabled')} />
              <Field label="Orders over (in your currency)" value={values['freeGift.threshold']} placeholder="e.g. 50" onChange={v => set('freeGift.threshold', v.replace(/[^\d.]/g, ''))} />
              <label className={ui.fieldLabel}>Gift product
                <select className={ui.select} value={values['freeGift.productId']} onChange={e => set('freeGift.productId', e.target.value)}>
                  <option value="">Choose a product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </Card>
            <Card title="Gift option at checkout" desc="Customers can tick This is a gift and write a message. You see it on the order and on the packing slip.">
              <Toggle label="Offer the gift option" keyName="checkout.giftOption" value={flags['checkout.giftOption']} onChange={() => toggle('checkout.giftOption')} />
            </Card>
            <Card title="Cancel an order without an account" desc="On the thank-you page and Track my order, customers can cancel a new order themselves for a short time, until you confirm it. Orders already confirmed or paid online are not offered it. You get a notification when one is cancelled.">
              <Toggle label="Let customers cancel a new order" keyName="orders.guestCancel.enabled" value={flags['orders.guestCancel.enabled']} onChange={() => toggle('orders.guestCancel.enabled')} />
              <Field label="They can cancel for (minutes, 5 to 240)" value={values['orders.guestCancel.minutes']} placeholder="30" onChange={v => set('orders.guestCancel.minutes', v.replace(/[^\d]/g, '').slice(0, 3))} />
            </Card>
            <Card title="Welcome discount" desc="First-time visitors are offered your first-order code for their WhatsApp number. Create the code first in Discounts (tick First order only).">
              <Toggle label="Show the welcome popup" keyName="welcome.enabled" value={flags['welcome.enabled']} onChange={() => toggle('welcome.enabled')} />
              <Field label="Discount code to give" value={values['welcome.code']} placeholder="e.g. WELCOME10" onChange={v => set('welcome.code', v.toUpperCase().replace(/\s+/g, ''))} />
              <Field label="Title" value={values['welcome.title']} placeholder="A gift for your first order" onChange={v => set('welcome.title', v)} />
              <Field label="Show after (seconds)" value={values['welcome.delaySeconds']} placeholder="8" onChange={v => set('welcome.delaySeconds', v.replace(/[^\d]/g, ''))} />
              <p className={ui.muted}><a className={ui.textLink} href="/admin/customers/whatsapp">See the WhatsApp list ({whatsappListCount})</a></p>
            </Card>
            <Card title="Invite a friend" desc="Every customer gets their own code on the thank-you page to share on WhatsApp. Friends get a discount on their first order. When a friend's order is delivered, you send the customer a thank-you code from Marketing > Invite a friend.">
              <Toggle label="Turn on invite a friend" keyName="invite.enabled" value={flags['invite.enabled']} onChange={() => toggle('invite.enabled')} />
              <Field label="Friend's discount on their first order (%)" value={values['invite.friendPercent']} placeholder="10" onChange={v => set('invite.friendPercent', v.replace(/[^\d]/g, '').slice(0, 2))} />
              <Field label="Thank-you amount for the customer (in your currency)" value={values['invite.reward']} placeholder="5" onChange={v => set('invite.reward', v.replace(/[^\d.]/g, ''))} />
              <Field label="Thank-you code valid for (days)" value={values['invite.rewardDays']} placeholder="60" onChange={v => set('invite.rewardDays', v.replace(/[^\d]/g, '').slice(0, 3))} />
              <p className={ui.muted}><a className={ui.textLink} href="/admin/marketing/invites">See friends&apos; orders and thank-you codes</a></p>
            </Card>
            <Card title="Questions on product pages" desc="Shoppers can ask about a product. You answer in Content > Questions, and published answers show on the product page for everyone.">
              <Toggle label="Show the Ask a question form" keyName="product.questions" value={flags['product.questions']} onChange={() => toggle('product.questions')} />
              <p className={ui.muted}><a className={ui.textLink} href="/admin/questions">See the questions</a></p>
            </Card>
            <Card title="Order on WhatsApp button" desc="A button on every product page that sends the product, option, quantity and price to your WhatsApp.">
              <Toggle label="Show the button" keyName="product.whatsappOrder" value={flags['product.whatsappOrder']} onChange={() => toggle('product.whatsappOrder')} />
            </Card>
            <Card title="Only a few left" desc="When a product's real stock is at or below this number, its page says &quot;Only 3 left&quot;. It uses the stock you keep in Products, so it is always true, and it never shows for products that are not counted or that you sell when out of stock.">
              <Field label="Show it when stock is at or below (leave empty to switch off)" value={values['product.lowStockThreshold']} placeholder="e.g. 5" onChange={v => set('product.lowStockThreshold', v.replace(/[^\d]/g, '').slice(0, 2))} />
            </Card>
            <Card title="Search words" desc="Words people type for your products, one group per line, e.g. soap = sabon, saboun. Arabic words work too. Search already forgives small typos.">
              <label className={ui.fieldLabel}>Word groups<textarea className={ui.textarea} rows={5} value={values['search.synonyms']} onChange={e => set('search.synonyms', e.target.value)} placeholder={'soap = sabon, saboun\ntissue = tissues, mahareem'} dir="auto" /></label>
            </Card>
            </>
          )}

          {tab === 'Notifications' && (
            <>
            <Card title="Operational notifications" desc="Choose which internal events should alert your team.">
              <Toggle label="New order notifications" keyName="notifications.orderEmail" value={flags['notifications.orderEmail']} onChange={() => toggle('notifications.orderEmail')} />
              <Toggle label="Low stock alerts" keyName="notifications.lowStock" value={flags['notifications.lowStock']} onChange={() => toggle('notifications.lowStock')} />
              <Toggle label="Review moderation alerts" keyName="notifications.reviews" value={flags['notifications.reviews']} onChange={() => toggle('notifications.reviews')} />
              <Toggle label="Sign-in alerts: a new device signed in to the admin, or an account was locked by wrong passwords" keyName="notifications.security" value={flags['notifications.security']} onChange={() => toggle('notifications.security')} />
            </Card>
            <Card title="Morning summary" desc="Every morning at about 8:30 (store time): yesterday's orders and sales, orders waiting for you, low stock and new reviews. Sent by email and as a phone notification to staff who turned notifications on. On Mondays, a weekly report email too: last week's sales against the week before, best sellers and top areas.">
              <Toggle label="Send the morning summary" keyName="notifications.dailySummary" value={flags['notifications.dailySummary']} onChange={() => toggle('notifications.dailySummary')} />
              <Toggle label="Weekly report by email on Mondays" keyName="notifications.weeklyReport" value={flags['notifications.weeklyReport']} onChange={() => toggle('notifications.weeklyReport')} />
              <Field label="Send the email to" value={values['notifications.summaryEmail']} placeholder={values['contact.email'] || 'Store email (Settings > General)'} onChange={v => set('notifications.summaryEmail', v)} />
            </Card>
            </>
          )}

          {tab === 'Email' && (
            <>
            <Card title="Sender" desc={defaultSender.domain ? `The name and address customers see on your emails. The address must end with @${defaultSender.domain}. Leave a box empty to use the default.` : 'Email sending is not set up yet.'}>
              <Field label="Sender name" value={values['email.fromName']} placeholder={defaultSender.name} onChange={v => set('email.fromName', v)} />
              <Field label="Sender address" value={values['email.fromAddress']} placeholder={defaultSender.address} onChange={v => set('email.fromAddress', v)} />
            </Card>
            <Card title="Customer email events" desc="Control automated customer messaging. Provider credentials are configured separately.">
              <Toggle label="Order confirmation" keyName="email.customerOrder" value={flags['email.customerOrder']} onChange={() => toggle('email.customerOrder')} />
              <Toggle label="Fulfillment / tracking" keyName="email.fulfillment" value={flags['email.fulfillment']} onChange={() => toggle('email.fulfillment')} />
              <Toggle label="Abandoned checkout recovery" keyName="email.abandonedCheckout" value={flags['email.abandonedCheckout']} onChange={() => toggle('email.abandonedCheckout')} />
              <Toggle label="Gift card issued" keyName="email.giftCard" value={flags['email.giftCard']} onChange={() => toggle('email.giftCard')} />
              <Toggle label="Return status updates" keyName="email.returnStatus" value={flags['email.returnStatus']} onChange={() => toggle('email.returnStatus')} />
              <Toggle label="Order edited by staff" keyName="email.orderEdit" value={flags['email.orderEdit']} onChange={() => toggle('email.orderEdit')} />
              <Toggle label="Ask for a review 1 day after delivery" keyName="email.reviewRequest" value={flags['email.reviewRequest']} onChange={() => toggle('email.reviewRequest')} />
            </Card>
            </>
          )}

          {tab === 'Security' && (
            <>
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
            <TwoStepCard />
            <SignInAlertsCard />
            <BlockedPhonesCard />
            </>
          )}

          {tab === 'Tracking' && (
            <>
            <Card title="Tracking & pixels" desc="Paste each platform's ID (or its whole install code — the ID is picked out of it). The store then reports page views, product views, add to cart, checkout, searches, sign-ups and purchases. Leave blank to turn a platform off.">
              <div className={ui.twoCol}>
                <Field label="Meta (Facebook) Pixel ID" value={values['tracking.metaPixelId']} onChange={v => set('tracking.metaPixelId', v)} />
                <Field label="Google Analytics measurement ID" value={values['tracking.gaMeasurementId']} onChange={v => set('tracking.gaMeasurementId', v)} />
                <Field label="TikTok Pixel ID" value={values['tracking.tiktokPixelId']} onChange={v => set('tracking.tiktokPixelId', v)} />
              </div>
            </Card>
            <Card title="Meta Conversions API (server)" desc="Your store's server also reports each sale straight to Meta, so sales still count when a shopper's browser blocks the pixel. Meta counts each sale once even when both the pixel and the server report it.">
              <label className={ui.fieldLabel}>Access token
                <input className={ui.input} type="password" autoComplete="off" value={capiToken} onChange={e => setCapiToken(e.target.value)} placeholder={capiTokenSaved ? 'Saved — paste a new one to replace it' : 'Paste the token from Events Manager'} />
              </label>
              <p className={ui.muted}>Get it in Meta Events Manager › your dataset › Settings › Conversions API › Generate access token.{capiTokenSaved ? ' A token is saved.' : ''}</p>
              {capiTokenSaved && <button type="button" className={`${ui.btn} ${ui.btnDanger} ${ui.btnSmall}`} onClick={async () => { try { await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key: 'tracking.metaCapiToken', value: '' }) }); setCapiTokenSaved(false); setCapiCheck('Token removed. The server no longer reports sales to Meta.') } catch (e) { setCapiCheck(e instanceof Error ? e.message : 'Could not remove the token') } }}>Remove token</button>}
              <Field label="Test event code (optional, for checking)" value={values['tracking.metaCapiTestCode']} onChange={v => set('tracking.metaCapiTestCode', v)} />
              <p className={ui.muted}>To check the connection: in Events Manager open Test events, copy the test code shown there, paste it here, Save, then press Check connection. Clear the code afterwards so real sales aren't marked as tests.</p>
              <div className="inline" style={{ gap: 10 }}>
                <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={async () => { setCapiCheck('Checking…'); try { await api('/api/admin/tracking/meta-test', { method: 'POST' }); setCapiCheck('Sent. A test Purchase should appear in Events Manager › Test events within a minute.') } catch (e) { setCapiCheck(e instanceof Error ? e.message : 'Check failed') } }}>Check connection</button>
                {capiCheck && <span className={ui.muted}>{capiCheck}</span>}
              </div>
            </Card>
            <ProductFeedCard />
            </>
          )}

          {tab === 'Maintenance' && (
            <Card title="Maintenance mode" desc="While it's on, customers see a maintenance page instead of the store, and search engines are told the store is closed only for now. You (signed-in staff) keep seeing the real store.">
              <Toggle label="Maintenance mode (store closed for customers)" keyName="maintenance.enabled" value={flags['maintenance.enabled']} onChange={() => toggle('maintenance.enabled')} />
              <Field label="Headline" value={values['maintenance.headline']} onChange={v => set('maintenance.headline', v)} />
              <Field label="Message" value={values['maintenance.message']} onChange={v => set('maintenance.message', v)} />
              <Field label="Expected back (optional, e.g. Back by 6 pm)" value={values['maintenance.backBy']} onChange={v => set('maintenance.backBy', v)} />
              <p className={ui.muted}>The page also shows your WhatsApp and contact email (Settings &gt; General). <a className={ui.textLink} href="/maintenance?preview=1" target="_blank" rel="noreferrer">Preview the page</a> (save first to see your changes).</p>
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

// Numbers that can't order online (customers who keep refusing cash-on-delivery packages).
function BlockedPhonesCard() {
  const [list, setList] = useState<Array<{ phone: string; note?: string; blockedAt: string }> | null>(null)
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { api('/api/admin/blocked-phones').then(d => setList(d.blocked || [])).catch(e => { setList([]); setMsg(e instanceof Error ? e.message : 'Could not load the list') }) }, [])
  async function update(body: Record<string, unknown>, done: string) {
    setMsg('')
    try { const d = await api('/api/admin/blocked-phones', { method: 'POST', body: JSON.stringify(body) }); setList(d.blocked || []); setMsg(done); setPhone('') } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not update') }
  }
  return (
    <Card title="Blocked phone numbers" desc="These numbers can't place orders on the store — for customers who keep ordering cash on delivery and refusing the package. You can also block a number from any order's page.">
      <div className="inline" style={{ gap: 8 }}>
        <input className={ui.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 70 123 456" inputMode="tel" />
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={!phone.trim()} onClick={() => update({ phone, note: 'Added in Settings' }, 'Number blocked.')}>Block number</button>
      </div>
      {msg && <p className={ui.muted}>{msg}</p>}
      {list === null ? <p className={ui.muted}>Loading…</p> : list.length === 0 ? <p className={ui.muted}>No blocked numbers.</p> : (
        <div>{list.map(item => (
          <div key={item.phone} className="inline" style={{ justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--admin-border)' }}>
            <span><strong>+{item.phone}</strong>{item.note ? <span className={ui.muted}> · {item.note}</span> : null}</span>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => update({ phone: item.phone, unblock: true }, 'Number unblocked.')}>Unblock</button>
          </div>
        ))}</div>
      )}
    </Card>
  )
}

// The catalog feed's address, to paste into Meta Commerce Manager and TikTok Catalog Manager.
function ProductFeedCard() {
  const [url, setUrl] = useState('/feeds/products.xml')
  const [copied, setCopied] = useState(false)
  useEffect(() => { setUrl(`${window.location.origin}/feeds/products.xml`) }, [])
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }
  return (
    <Card title="Product feed for catalog ads" desc="A live list of your products (photos, prices, stock) for Meta and TikTok catalog ads, which show each shopper the products they looked at. It updates by itself as you edit products.">
      <label className={ui.fieldLabel}>Feed address
        <div className="inline" style={{ gap: 8 }}>
          <input className={ui.input} value={url} readOnly onFocus={e => e.currentTarget.select()} />
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </label>
      <p className={ui.muted}><strong>Meta:</strong> Commerce Manager › your catalog › Data sources › Add items › Data feed › Scheduled feed, paste the address, repeat daily.</p>
      <p className={ui.muted}><strong>TikTok:</strong> Ads Manager › Assets › Catalogs › your catalog › Add products › Data feed schedule, paste the address.</p>
      <a className={ui.textLink} href="/feeds/products.xml" target="_blank" rel="noreferrer">Preview the feed</a>
    </Card>
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

// The countries checkout offers and accepts (lib/delivery-countries.ts). Nothing saved: the store's
// own country only. Saved with the page's Save button, as a list of country codes.
function DeliveryCountriesCard({ value, storeCountry, onChange }: { value: string; storeCountry: string; onChange: (v: string) => void }) {
  const codes = deliveryCountries(value, storeCountry)
  const others = REGION_CODES.filter(c => !codes.includes(c)).map(c => ({ code: c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name))
  const save = (list: string[]) => onChange(JSON.stringify(list))
  return (
    <Card title="Countries you deliver to" desc="Checkout only offers these countries, and orders for any other country are refused. With one country, customers just see it written; with more, they choose from a list.">
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        {codes.map(code => (
          <span key={code} className={ui.statusPill} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {countryName(code)}
            {codes.length > 1 && <button type="button" onClick={() => save(codes.filter(c => c !== code))} aria-label={`Remove ${countryName(code)}`} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1 }}>&times;</button>}
          </span>
        ))}
      </div>
      <label className={ui.fieldLabel}>Add a country
        <select className={ui.select} value="" onChange={e => { if (e.target.value) save([...codes, e.target.value]) }}>
          <option value="">Choose a country</option>
          {others.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>
      <p className={ui.muted}>Then tap Save. For a new country, also add its delivery price in Shipping, or checkout uses the default delivery price.</p>
    </Card>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className={ui.fieldLabel}>
      {label}
      <input className={ui.input} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
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
