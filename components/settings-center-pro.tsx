'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Store, CreditCard, Truck, Globe2, Mail, ShieldCheck, Search, Bell, Code2, ChevronRight, BarChart3, Wrench, Gift } from 'lucide-react'
import { MAINTENANCE_MODES, MAINTENANCE_MODE_INFO, maintenanceMode } from '@/lib/maintenance-defaults'
import styles from './admin-settings-center.module.css'
import ui from './admin-ui.module.css'
import MediaPicker from './media-picker'
import UnsavedBar from './admin-unsaved-bar'
import { useConfirm } from './admin-confirm'
import AppIconCard from './app-icon-card'
import TwoStepCard from './two-step-card'
import SignInAlertsCard from './sign-in-alerts-card'
import { REGION_CODES, countryName, deliveryCountries } from '@/lib/delivery-countries'
import { POLICY_DEFAULTS } from '@/lib/policy-defaults'
import { CountrySelect, CountryMultiSelect, CurrencySelect, TimezoneSelect } from './field-selects'
import { allowLeave, useLeaveGuard } from './use-leave-guard'
import { fetchRead } from '@/lib/retry-fetch'
import { SUGGESTED_TEMPLATE_NAMES, WHATSAPP_LABELS, WHATSAPP_LANGUAGES, WHATSAPP_UPDATES, templateBody, type WhatsAppUpdate } from '@/lib/whatsapp-templates'

// Settings › Email & messaging › Automatic WhatsApp messages: the template name saved for each message.
const WA_TEMPLATE_KEYS: Record<WhatsAppUpdate, string> = { confirmed: 'whatsapp.cloud.templateConfirmed', on_the_way: 'whatsapp.cloud.templateOnTheWay', delivered: 'whatsapp.cloud.templateDelivered' }
const waTemplateInput = (v: string) => v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 512)

const groups = [
  { key: 'General', label: 'General', icon: Store, desc: 'Store identity and regional defaults' },
  { key: 'Payments', label: 'Payments', icon: CreditCard, desc: 'Payment methods and checkout status' },
  { key: 'Shipping', label: 'Shipping & delivery', icon: Truck, desc: 'Shipping defaults and checkout behavior' },
  { key: 'Markets', label: 'Markets', icon: Globe2, desc: 'Currency and localization' },
  { key: 'Selling', label: 'Selling tools', icon: Gift, desc: 'Free gift, gift option, cancel an order, welcome discount, invite a friend, questions, WhatsApp button, search words' },
  { key: 'Notifications', label: 'Notifications', icon: Bell, desc: 'Order and operational alerts' },
  { key: 'Email', label: 'Email & messaging', icon: Mail, desc: 'Customer emails and automatic WhatsApp messages' },
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

const PAYMENT_FIELDS = ['provider', 'merchantId', 'merchantName', 'apiBaseUrl', 'apiVersion', 'checkoutScriptUrl'] as const

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

export default function SettingsCenterPro({ initial, addSearchWord, metaCapiTokenSet = false, metaCapiTokenUnreadable = false, whatsappTokenSet = false, whatsappTokenUnreadable = false, emailFromDefault = '', appIcon, products = [], whatsappListCount = 0 }: { initial: any[]; addSearchWord?: string; metaCapiTokenSet?: boolean; metaCapiTokenUnreadable?: boolean; whatsappTokenSet?: boolean; whatsappTokenUnreadable?: boolean; emailFromDefault?: string; appIcon?: { brandName: string; source: string; brandColor: string; saved: { large: string; small: string } }; products?: Array<{ id: string; name: string }>; whatsappListCount?: number }) {
  const map = useMemo(() => new Map(initial.map(x => [x.key, x.value])), [initial])
  const [tab, setTab] = useState('General')
  // A term the shoppers searched for and found nothing: add it as a new word group, left for the owner to finish.
  useEffect(() => {
    const word = (addSearchWord || '').trim()
    if (!word) return
    setTab('Selling')
    setValues(current => {
      const groups = current['search.synonyms'] || ''
      if (groups.toLowerCase().split('\n').some(line => line.split('=')[0].trim().toLowerCase() === word.toLowerCase())) return current
      return { ...current, 'search.synonyms': groups.trim() ? `${groups.replace(/\s+$/, '')}\n${word} = ` : `${word} = ` }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSearchWord])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const [notice, setNotice] = useState('')
  const [shareImageOpen, setShareImageOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => ({
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
    'payment.bank.label': map.get('payment.bank.label') || '',
    'payment.bank.name': map.get('payment.bank.name') || '',
    'payment.bank.accountName': map.get('payment.bank.accountName') || '',
    'payment.bank.iban': map.get('payment.bank.iban') || '',
    'payment.bank.instructions': map.get('payment.bank.instructions') || '',
    'product.lowStockThreshold': map.get('product.lowStockThreshold') || '',
    'notifications.stuckOrderMinutes': map.get('notifications.stuckOrderMinutes') || '',
    'invite.friendPercent': map.get('invite.friendPercent') || '10',
    'invite.reward': map.get('invite.reward') || '5',
    'invite.rewardDays': map.get('invite.rewardDays') || '60',
    'store.address': map.get('store.address') || '',
    'stores.list': map.get('stores.list') || '',
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
    'tracking.googleAdsId': map.get('tracking.googleAdsId') || '',
    'tracking.googleAdsPurchaseLabel': map.get('tracking.googleAdsPurchaseLabel') || '',
    'tracking.tiktokPixelId': map.get('tracking.tiktokPixelId') || '',
    'tracking.metaCapiTestCode': map.get('tracking.metaCapiTestCode') || '',
    'maintenance.mode': maintenanceMode(map.get('maintenance.mode')),
    // Empty means "use the selected mode's wording"; the placeholder in the form shows it.
    'maintenance.headline': map.get('maintenance.headline') || '',
    'maintenance.message': map.get('maintenance.message') || '',
    'maintenance.backBy': map.get('maintenance.backBy') || '',
    // The countries checkout delivers to (Shipping & delivery). It wasn't read here, so the card showed only the
    // store's own country, and adding a country saved that one over the saved list.
    'checkout.countries': map.get('checkout.countries') || '',
    // Automatic WhatsApp messages (Email & messaging); template names stay empty until the owner types them.
    'whatsapp.cloud.phoneNumberId': map.get('whatsapp.cloud.phoneNumberId') || '',
    'whatsapp.cloud.language': map.get('whatsapp.cloud.language') || 'en',
    'whatsapp.cloud.templateConfirmed': map.get('whatsapp.cloud.templateConfirmed') || '',
    'whatsapp.cloud.templateOnTheWay': map.get('whatsapp.cloud.templateOnTheWay') || '',
    'whatsapp.cloud.templateDelivered': map.get('whatsapp.cloud.templateDelivered') || '',
  }))
  // The Conversions API token is write-only: typed in to save or replace it, never shown back.
  const [capiToken, setCapiToken] = useState('')
  const [capiTokenSaved, setCapiTokenSaved] = useState(metaCapiTokenSet)
  const [capiCheck, setCapiCheck] = useState('')
  // The WhatsApp access key is write-only too. "Send a test" sends one message, with a sample order, to the number typed.
  const [waToken, setWaToken] = useState('')
  const [waTokenSaved, setWaTokenSaved] = useState(whatsappTokenSet)
  const [waNote, setWaNote] = useState('')
  const [waTestPhone, setWaTestPhone] = useState('')
  const [waTestKind, setWaTestKind] = useState<WhatsAppUpdate>('confirmed')
  const [waTesting, setWaTesting] = useState(false)
  const defaultSender = useMemo(() => {
    const match = /^\s*(.*?)\s*<\s*([^<>\s]+)\s*>\s*$/.exec(emailFromDefault)
    const address = (match ? match[2] : emailFromDefault).trim()
    return { name: match ? match[1].replace(/^"|"$/g, '').trim() : '', address, domain: address.split('@')[1] || '' }
  }, [emailFromDefault])
  const [flags, setFlags] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries([
      'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
      'checkout.guestCheckout', 'notifications.orderEmail', 'notifications.lowStock',
      'notifications.reviews', 'notifications.security', 'notifications.orderProblems', 'notifications.dailySummary', 'notifications.weeklyReport', 'email.customerOrder', 'email.fulfillment', 'email.abandonedCheckout', 'email.giftCard', 'email.returnStatus', 'email.orderEdit', 'email.reviewRequest',
      'checkout.giftOption', 'product.whatsappOrder', 'product.questions',
    ].map(k => [k, map.get(k) !== 'false'])),
    // Off until switched on.
    ...Object.fromEntries(['currency.showLbp', 'freeGift.enabled', 'welcome.enabled', 'invite.enabled', 'whatsapp.cloud.enabled'].map(k => [k, map.get(k) === 'true'])),
    'maintenance.enabled': map.get('maintenance.enabled') === 'true',
  }))
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(defaultPaymentConfig)
  // The provider settings as saved: loaded the first time Payments is opened (null until then).
  const [paymentSaved, setPaymentSaved] = useState<PaymentConfig | null>(null)
  const paymentRequested = useRef(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  // What the server has. The page compares what is on screen with it to know what is unsaved (the status, the bar
  // and the leave warning): a switch, a country taken off or a share image count; the search box, the Section list
  // on phones and the cards that save by themselves (blocked numbers, 2-step login) don't.
  const [saved, setSaved] = useState(() => ({ values, flags }))
  const paymentChanged = !!paymentSaved && (!!paymentConfig.apiPassword.trim() || PAYMENT_FIELDS.some(key => paymentConfig[key] !== paymentSaved[key]))
  const dirty = paymentChanged || !!capiToken.trim() || !!waToken.trim()
    || Object.keys(values).some(key => (values[key] || '') !== (saved.values[key] || ''))
    || Object.keys(flags).some(key => flags[key] !== saved.flags[key])
  const [saveError, setSaveError] = useState('')

  // Asks before leaving with unsaved changes: admin links, Back, reload (components/use-leave-guard.ts).
  useLeaveGuard(dirty)

  useEffect(() => {
    // Loaded once: coming back to Payments keeps what was typed there (it used to load again over it).
    if (tab !== 'Payments' || paymentRequested.current) return
    paymentRequested.current = true
    setPaymentLoading(true); setPaymentError('')
    api('/api/admin/payment-provider')
      .then(d => { const config = { ...defaultPaymentConfig, ...d, apiPassword: '' }; setPaymentConfig(config); setPaymentSaved(config) })
      .catch(e => { paymentRequested.current = false; setPaymentError(e instanceof Error ? e.message : 'Unable to load payment provider settings') })
      .finally(() => setPaymentLoading(false))
  }, [tab])

  const filtered = groups.filter(g => `${g.label} ${g.desc}`.toLowerCase().includes(search.toLowerCase()))
  // The test uses what is saved, so it waits for unsaved WhatsApp changes to be saved.
  const waUnsaved = !!waToken.trim() || Object.keys(values).some(key => key.startsWith('whatsapp.cloud.') && (values[key] || '') !== (saved.values[key] || ''))
  async function sendWhatsAppTest() {
    if (waUnsaved) { setWaNote('Save your changes first, then send the test.'); return }
    setWaTesting(true); setWaNote('Sending…')
    try {
      await api('/api/admin/whatsapp/test', { method: 'POST', body: JSON.stringify({ phone: waTestPhone, kind: waTestKind }) })
      setWaNote('Sent. It should arrive on that WhatsApp within a minute.')
    } catch (e) {
      setWaNote(e instanceof Error ? e.message : 'The test was not sent')
    } finally {
      setWaTesting(false)
    }
  }
  async function removeWhatsAppToken() {
    if (!(await confirm({ title: 'Remove the WhatsApp access key?', message: 'No automatic WhatsApp messages go out until you paste a key again, and checkout stops offering them.', confirmLabel: 'Remove key' }))) return
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key: 'whatsapp.cloud.accessToken', value: '' }) })
      setWaTokenSaved(false)
      setWaNote('Access key removed. No WhatsApp messages go out until you paste a new one.')
    } catch (e) {
      setWaNote(e instanceof Error ? e.message : 'Could not remove the key')
    }
  }
  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }))
  const toggle = (key: string) => setFlags(v => ({ ...v, [key]: !v[key] }))

  // Discard: the page reloads the saved values from the server.
  async function discardChanges() {
    if (!(await confirm({ title: 'Discard your changes?', message: 'Settings you changed on this page go back to their saved values.', confirmLabel: 'Discard changes' }))) return
    // It has asked already: reload without the leave warning asking a second time.
    allowLeave()
    window.location.reload()
  }

  async function save() {
    setSaving(true)
    setNotice(''); setSaveError('')
    try {
      // One request for everything; the server writes only what changed.
      const settings: Record<string, string> = { ...values, ...Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, String(value)])) }
      // The policy pages show "Last updated"; move it forward only when their wording changed.
      const policyKeys = ['store.address', 'contact.email', 'contact.phone', 'store.country', 'policy.returnDays', 'policy.refundTime', 'policy.damageReportHours']
      const policyChanged = policyKeys.some(key => (values[key] || '') !== (saved.values[key] || ''))
      if (policyChanged) settings['policy.updatedAt'] = new Date().toISOString()
      if (capiToken.trim()) settings['tracking.metaCapiToken'] = capiToken.trim()
      if (waToken.trim()) settings['whatsapp.cloud.accessToken'] = waToken.trim()
      // The online payment provider is saved whichever tab is open (it was saved only from Payments, so what was typed
      // there was lost if Save was pressed on another tab). It also owns the Online card switch, payment.card, with its
      // own checks: both saves used to write the switch at once, the provider's with the value it had on opening.
      const sendPayment = !!paymentSaved && (paymentChanged || flags['payment.card'] !== saved.flags['payment.card'])
      if (sendPayment) delete settings['payment.card']
      const [, savedPayment] = await Promise.all([
        api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings }) }),
        sendPayment ? api('/api/admin/payment-provider', { method: 'PATCH', body: JSON.stringify({ ...paymentConfig, enabled: flags['payment.card'] }) }) : Promise.resolve(null),
      ])
      if (savedPayment) { const config = { ...defaultPaymentConfig, ...savedPayment, apiPassword: '' }; setPaymentConfig(config); setPaymentSaved(config) }
      if (capiToken.trim()) { setCapiTokenSaved(true); setCapiToken('') }
      if (waToken.trim()) { setWaTokenSaved(true); setWaToken('') }
      setSaved({ values, flags })
      setNotice('All settings saved')
    } catch (e) {
      // Shown in the bar that stays at the top of the screen, where Save was pressed (it was shown above the page).
      setSaveError(e instanceof Error ? e.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  const activeGroup = groups.find(g => g.key === tab) || groups[0]
  const ActiveIcon = activeGroup.icon

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.headTitle}>
          <span className={`${ui.muted} ${ui.tiny}`}>Store configuration</span>
          <h1>Settings</h1>
          <p>Control how your store looks, sells, and communicates with customers.</p>
        </div>
        <div className={styles.headActions}>
          <span className={`${styles.status} ${dirty ? styles.statusDirty : styles.statusSaved}`} role="status">
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <div className={styles.search}>
            <Search size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings" aria-label="Search settings" />
          </div>
          <button className={`${ui.btn} ${styles.saveBtn}`} onClick={save} disabled={saving || paymentLoading}>
            <Save size={15} />{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <UnsavedBar dirty={dirty || !!saveError} saving={saving} onDiscard={discardChanges} onSave={save} error={saveError} />
      {notice && <div className={ui.alert} role="status" style={{ marginBottom: 14 }}>{notice}</div>}

      <div className={styles.layout}>
        {/* Phones: one dropdown for all settings sections instead of a sideways-scrolling row of cards. */}
        <label className={styles.navSelect}>
          <span>Section</span>
          <select className={ui.input} value={tab} onChange={e => setTab(e.target.value)}>
            {(filtered.some(g => g.key === tab) ? filtered : [...groups.filter(g => g.key === tab), ...filtered]).map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        {/* The section open now is marked for screen readers too (it was shown only by its colour). */}
        <nav className={styles.nav} aria-label="Settings sections">
          {filtered.map(g => {
            const Icon = g.icon
            return (
              <button
                key={g.key}
                type="button"
                className={tab === g.key ? `${styles.navButton} ${styles.navButtonActive}` : styles.navButton}
                aria-current={tab === g.key ? 'true' : undefined}
                onClick={() => setTab(g.key)}
              >
                <span className={styles.navIcon}><Icon size={17} /></span>
                <span className={styles.navText}><strong>{g.label}</strong><small>{g.desc}</small></span>
                <ChevronRight size={15} />
              </button>
            )
          })}
          {!filtered.length && <p className={styles.navEmpty}>No section matches your search.</p>}
        </nav>

        {/* Not a second main landmark: the admin's own main holds the page. */}
        <div className={styles.main}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionIcon} aria-hidden="true"><ActiveIcon size={22} /></span>
            <div>
              <h2>{activeGroup.label}</h2>
              <p>{activeGroup.desc}</p>
            </div>
          </div>
          {tab === 'General' && (
            <>
              <Card title="Store details" desc="Basic information used throughout your storefront.">
                <div className={ui.twoCol}>
                  <Field label="Store name" value={values['store.name']} onChange={v => set('store.name', v)} />
                  <label className={ui.fieldLabel}>Currency<CurrencySelect className={ui.select} value={values['store.currency']} onChange={v => set('store.currency', v)} /></label>
                  <label className={ui.fieldLabel}>Country<CountrySelect className={ui.select} value={values['store.country']} onChange={v => set('store.country', v)} /></label>
                  <label className={ui.fieldLabel}>Timezone<TimezoneSelect className={ui.select} value={values['store.timezone']} onChange={v => set('store.timezone', v)} /></label>
                  <Field label="Store email" type="email" value={values['contact.email']} onChange={v => set('contact.email', v)} />
                  <Field label="Phone / WhatsApp" type="tel" value={values['contact.phone']} onChange={v => set('contact.phone', v)} />
                </div>
                <Field label="Business address" value={values['store.address']} onChange={v => set('store.address', v)} />
                <label className={ui.fieldLabel}>Pickup locations (optional)<textarea className={ui.textarea} rows={4} placeholder={'Hamra shop | Hamra St 12 | Mon-Sat 9:00-20:00 | +961 1 234 567'} value={values['stores.list'] || ''} onChange={e => set('stores.list', e.target.value)} /><span className={ui.muted} style={{ fontSize: 12 }}>One place per line: name | address | opening hours | phone. Shown on the Our stores page.</span></label>
                <span className={ui.fieldHelp}>Shown under "Contact us" on your Privacy, Terms and Refund pages. Leave empty to show only email and WhatsApp.</span>
              </Card>

              <Card title="Policies" desc="Used in the wording of your Refund Policy page. Customers see these exact values.">
                <div className={ui.twoCol}>
                  <Field label="Return window (days)" inputMode="numeric" value={values['policy.returnDays']} onChange={v => set('policy.returnDays', v.replace(/\D/g, ''))} />
                  <Field label="Report damaged items within (hours)" inputMode="numeric" value={values['policy.damageReportHours']} onChange={v => set('policy.damageReportHours', v.replace(/\D/g, ''))} />
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
                <Toggle label="Store wallet (signed-in customers pay from their balance)" keyName="payment.wallet" value={flags['payment.wallet']} onChange={() => toggle('payment.wallet')} />
              </Card>

              <Card title="Bank transfer, Whish or OMT details" desc="Customers who choose Bank transfer see these details at checkout and on their thank-you page, and can send you a screenshot of the transfer. Use it for a bank account, Whish Money or OMT. Switch Bank transfer on above to offer it.">
                <Field label="Name shown at checkout (empty = Bank transfer)" value={values['payment.bank.label']} placeholder="e.g. Whish / OMT / bank transfer" onChange={v => set('payment.bank.label', v.slice(0, 40))} />
                <Field label="Bank or service name" value={values['payment.bank.name']} placeholder="e.g. Whish Money, OMT, Bank Audi" onChange={v => set('payment.bank.name', v.slice(0, 80))} />
                <Field label="Account name" value={values['payment.bank.accountName']} placeholder="The name on the account" onChange={v => set('payment.bank.accountName', v.slice(0, 80))} />
                <Field label="Account number, IBAN or phone number" value={values['payment.bank.iban']} placeholder="e.g. 03 123 456 or LB00 0000 0000" onChange={v => set('payment.bank.iban', v.slice(0, 80))} />
                <label className={ui.fieldLabel}>Instructions for customers (optional)<textarea className={ui.textarea} rows={3} value={values['payment.bank.instructions']} maxLength={500} onChange={e => set('payment.bank.instructions', e.target.value)} placeholder="e.g. Write your order number in the transfer note." /></label>
              </Card>

              <Card title="Online payment provider" desc="Connect and switch gateways without changing checkout code.">
                {paymentError && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{paymentError}</div>}
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
                <Field label="Free shipping threshold" inputMode="decimal" value={values['checkout.freeShippingThreshold']} onChange={v => set('checkout.freeShippingThreshold', v)} />
                <Field label="Default tax rate (%)" inputMode="decimal" value={values['checkout.taxRatePercent']} onChange={v => set('checkout.taxRatePercent', v)} />
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
              <Field label="Rate: LBP for $1" inputMode="numeric" value={values['currency.lbpRate']} placeholder="e.g. 89500" onChange={v => set('currency.lbpRate', v.replace(/[^\d]/g, ''))} />
            </Card>
            </>
          )}

          {tab === 'Selling' && (
            <>
            <Card title="Free gift above an amount" desc="Orders that reach the amount get the gift product free, while it is in stock. Shoppers see how far they are in the cart.">
              <Toggle label="Give a free gift" keyName="freeGift.enabled" value={flags['freeGift.enabled']} onChange={() => toggle('freeGift.enabled')} />
              <Field label="Orders over (in your currency)" inputMode="decimal" value={values['freeGift.threshold']} placeholder="e.g. 50" onChange={v => set('freeGift.threshold', v.replace(/[^\d.]/g, ''))} />
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
            <Card title="Welcome discount" desc="First-time visitors are offered your first-order code for their WhatsApp number. Create the code first in Discounts (tick First order only).">
              <Toggle label="Show the welcome popup" keyName="welcome.enabled" value={flags['welcome.enabled']} onChange={() => toggle('welcome.enabled')} />
              <Field label="Discount code to give" value={values['welcome.code']} placeholder="e.g. WELCOME10" onChange={v => set('welcome.code', v.toUpperCase().replace(/\s+/g, ''))} />
              <Field label="Title" value={values['welcome.title']} placeholder="A gift for your first order" onChange={v => set('welcome.title', v)} />
              <Field label="Show after (seconds)" inputMode="numeric" value={values['welcome.delaySeconds']} placeholder="8" onChange={v => set('welcome.delaySeconds', v.replace(/[^\d]/g, ''))} />
              <p className={ui.muted}><a className={ui.textLink} href="/admin/customers/whatsapp">See the WhatsApp list ({whatsappListCount})</a></p>
            </Card>
            <Card title="Invite a friend" desc="Every customer gets their own code on the thank-you page to share on WhatsApp. Friends get a discount on their first order. When a friend's order is delivered, you send the customer a thank-you code from Marketing > Invite a friend.">
              <Toggle label="Turn on invite a friend" keyName="invite.enabled" value={flags['invite.enabled']} onChange={() => toggle('invite.enabled')} />
              <Field label="Friend's discount on their first order (%)" inputMode="numeric" value={values['invite.friendPercent']} placeholder="10" onChange={v => set('invite.friendPercent', v.replace(/[^\d]/g, '').slice(0, 2))} />
              <Field label="Thank-you amount for the customer (in your currency)" inputMode="decimal" value={values['invite.reward']} placeholder="5" onChange={v => set('invite.reward', v.replace(/[^\d.]/g, ''))} />
              <Field label="Thank-you code valid for (days)" inputMode="numeric" value={values['invite.rewardDays']} placeholder="60" onChange={v => set('invite.rewardDays', v.replace(/[^\d]/g, '').slice(0, 3))} />
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
              <Field label="Show it when stock is at or below (leave empty to switch off)" inputMode="numeric" value={values['product.lowStockThreshold']} placeholder="e.g. 5" onChange={v => set('product.lowStockThreshold', v.replace(/[^\d]/g, '').slice(0, 2))} />
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
            <Card title="Order problems" desc="An instant phone notification and email when a customer could not place an order, or when a new order has not been confirmed for too long. No reminders at night (11 pm to 8 am store time): they wait for the morning.">
              <Toggle label="Tell me about order problems" keyName="notifications.orderProblems" value={flags['notifications.orderProblems']} onChange={() => toggle('notifications.orderProblems')} />
              <Field label="Remind me when a new order waits this many minutes (empty = 60, 0 = never)" inputMode="numeric" value={values['notifications.stuckOrderMinutes']} placeholder="60" onChange={v => set('notifications.stuckOrderMinutes', v.replace(/[^\d]/g, '').slice(0, 3))} />
            </Card>
            <Card title="Morning summary" desc="Every morning at about 8:30 (store time): yesterday's orders and sales, orders waiting for you, low stock and new reviews. Sent by email and as a phone notification to staff who turned notifications on. On Mondays, a weekly report email too: last week's sales against the week before, best sellers and top areas.">
              <Toggle label="Send the morning summary" keyName="notifications.dailySummary" value={flags['notifications.dailySummary']} onChange={() => toggle('notifications.dailySummary')} />
              <Toggle label="Weekly report by email on Mondays" keyName="notifications.weeklyReport" value={flags['notifications.weeklyReport']} onChange={() => toggle('notifications.weeklyReport')} />
              <Field label="Send the email to" type="email" value={values['notifications.summaryEmail']} placeholder={values['contact.email'] || 'Store email (Settings > General)'} onChange={v => set('notifications.summaryEmail', v)} />
            </Card>
            </>
          )}

          {tab === 'Email' && (
            <>
            <Card title="Sender" desc={defaultSender.domain ? `The name and address customers see on your emails. The address must end with @${defaultSender.domain}. Leave a box empty to use the default.` : 'Email sending is not set up yet.'}>
              <Field label="Sender name" value={values['email.fromName']} placeholder={defaultSender.name} onChange={v => set('email.fromName', v)} />
              <Field label="Sender address" type="email" value={values['email.fromAddress']} placeholder={defaultSender.address} onChange={v => set('email.fromAddress', v)} />
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
            <Card title="Automatic WhatsApp messages" desc="Customers who tick “Send my order updates on WhatsApp” at checkout get a message from your WhatsApp Business number when you confirm their order, when it is out for delivery and when it is delivered. Checkout offers the choice once this is switched on and set up. Meta charges per message, at its utility rate.">
              <Toggle label="Send automatic WhatsApp messages" keyName="whatsapp.cloud.enabled" value={flags['whatsapp.cloud.enabled']} onChange={() => toggle('whatsapp.cloud.enabled')} />
              <div className={ui.twoCol}>
                <Field label="Phone number ID" inputMode="numeric" value={values['whatsapp.cloud.phoneNumberId']} placeholder="e.g. 106540352242922" onChange={v => set('whatsapp.cloud.phoneNumberId', v.replace(/\D/g, '').slice(0, 25))} />
                <label className={ui.fieldLabel}>Template language
                  <select className={ui.select} value={values['whatsapp.cloud.language']} onChange={e => set('whatsapp.cloud.language', e.target.value)}>
                    {WHATSAPP_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
                  </select>
                </label>
              </div>
              <label className={ui.fieldLabel}>Access key
                <input className={ui.input} type="password" autoComplete="off" value={waToken} onChange={e => setWaToken(e.target.value)} placeholder={waTokenSaved ? 'Saved — paste a new one to replace it' : 'Paste the permanent access key'} />
              </label>
              <p className={ui.muted}>Both come from Meta: the phone number ID is in WhatsApp Manager › Phone numbers (or your app › WhatsApp › API setup). The access key is a permanent one from Business settings › Users › System users › Generate token, with the whatsapp_business_messaging permission. It is stored encrypted and never shown again.{waTokenSaved ? ' A key is saved.' : ''}</p>
              {whatsappTokenUnreadable && <p role="alert" style={{ margin: 0, color: '#b42318', fontWeight: 700 }}>The saved access key can no longer be read (the store&apos;s secret key changed). No WhatsApp messages go out until you paste it again.</p>}
              {waTokenSaved && <button type="button" className={`${ui.btn} ${ui.btnDanger} ${ui.btnSmall}`} onClick={removeWhatsAppToken}>Remove access key</button>}
              <div className={ui.twoCol}>
                {WHATSAPP_UPDATES.map(kind => <Field key={kind} label={`“${WHATSAPP_LABELS[kind]}” template name`} value={values[WA_TEMPLATE_KEYS[kind]]} placeholder={SUGGESTED_TEMPLATE_NAMES[kind]} onChange={v => set(WA_TEMPLATE_KEYS[kind], waTemplateInput(v))} />)}
              </div>
              <p className={ui.muted}>Leave a name empty to not send that message.</p>
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>The three templates to create in WhatsApp Manager</summary>
                <p className={ui.muted}>In WhatsApp Manager › Message templates › Create template: category Utility, language {WHATSAPP_LANGUAGES.find(l => l.code === values['whatsapp.cloud.language'])?.label || 'English'}, the name below, and this text as the body (the {'{{1}}'}-style values are filled in for each order). Meta usually approves them within minutes.</p>
                {WHATSAPP_UPDATES.map(kind => (
                  <div key={kind} style={{ marginTop: 10 }}>
                    <strong>{values[WA_TEMPLATE_KEYS[kind]] || SUGGESTED_TEMPLATE_NAMES[kind]}</strong> <span className={ui.muted}>({WHATSAPP_LABELS[kind]})</span>
                    <pre dir="auto" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', padding: '10px 12px', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', background: 'var(--admin-bg)', fontFamily: 'inherit', fontSize: 13 }}>{templateBody(kind, values['whatsapp.cloud.language'])}</pre>
                  </div>
                ))}
              </details>
              <div className="inline" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Send a test to (your WhatsApp number)" type="tel" value={waTestPhone} placeholder="e.g. 70 123 456" onChange={setWaTestPhone} />
                <label className={ui.fieldLabel}>Message
                  <select className={ui.select} value={waTestKind} onChange={e => setWaTestKind(e.target.value as WhatsAppUpdate)}>
                    {WHATSAPP_UPDATES.map(kind => <option key={kind} value={kind}>{WHATSAPP_LABELS[kind]}</option>)}
                  </select>
                </label>
                <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={waTesting || !waTestPhone.trim()} onClick={sendWhatsAppTest}>{waTesting ? 'Sending…' : 'Send test'}</button>
              </div>
              {waNote && <p className={ui.muted} role="status" style={{ margin: 0 }}>{waNote}</p>}
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
                <Field label="Google Ads conversion ID" value={values['tracking.googleAdsId']} onChange={v => set('tracking.googleAdsId', v)} />
                <Field label="Google Ads purchase conversion label" value={values['tracking.googleAdsPurchaseLabel']} onChange={v => set('tracking.googleAdsPurchaseLabel', v)} />
                <Field label="TikTok Pixel ID" value={values['tracking.tiktokPixelId']} onChange={v => set('tracking.tiktokPixelId', v)} />
              </div>
            </Card>
            <Card title="Meta Conversions API (server)" desc="Your store's server also reports each sale straight to Meta, so sales still count when a shopper's browser blocks the pixel. Meta counts each sale once even when both the pixel and the server report it.">
              <label className={ui.fieldLabel}>Access token
                <input className={ui.input} type="password" autoComplete="off" value={capiToken} onChange={e => setCapiToken(e.target.value)} placeholder={capiTokenSaved ? 'Saved — paste a new one to replace it' : 'Paste the token from Events Manager'} />
              </label>
              <p className={ui.muted}>Get it in Meta Events Manager › your dataset › Settings › Conversions API › Generate access token.{capiTokenSaved ? ' A token is saved.' : ''}</p>
              {metaCapiTokenUnreadable && <p role="alert" style={{ margin: 0, color: '#b42318', fontWeight: 700 }}>The saved token can no longer be read (the store&apos;s secret key changed). Purchases are not reported to Meta until you paste the token again.</p>}
              {capiTokenSaved && <button type="button" className={`${ui.btn} ${ui.btnDanger} ${ui.btnSmall}`} onClick={async () => { try { await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key: 'tracking.metaCapiToken', value: '' }) }); setCapiTokenSaved(false); setCapiCheck('Token removed. The server no longer reports sales to Meta.') } catch (e) { setCapiCheck(e instanceof Error ? e.message : 'Could not remove the token') } }}>Remove token</button>}
              <Field label="Test event code (optional, for checking)" value={values['tracking.metaCapiTestCode']} onChange={v => set('tracking.metaCapiTestCode', v)} />
              <p className={ui.muted}>To check the connection: in Events Manager open Test events, copy the test code shown there, paste it here, Save, then press Check connection. Clear the code afterwards so real sales aren't marked as tests.</p>
              <div className="inline" style={{ gap: 10 }}>
                <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={async () => { setCapiCheck('Checking…'); try { await api('/api/admin/tracking/meta-test', { method: 'POST' }); setCapiCheck('Sent. A test Purchase should appear in Events Manager › Test events within a minute.') } catch (e) { setCapiCheck(e instanceof Error ? e.message : 'Check failed') } }}>Check connection</button>
                {capiCheck && <span className={ui.muted} role="status">{capiCheck}</span>}
              </div>
            </Card>
            <ProductFeedCard />
            </>
          )}

          {tab === 'Maintenance' && (
            <Card title="Maintenance mode" desc="While it's on, customers see a page instead of the store, and search engines are told the store is closed only for now. You (signed-in staff) keep seeing the real store.">
              <Toggle label="Maintenance mode (store closed for customers)" keyName="maintenance.enabled" value={flags['maintenance.enabled']} onChange={() => toggle('maintenance.enabled')} />
              <label className={ui.fieldLabel}>
                Page type
                <select className={ui.select} value={values['maintenance.mode'] || 'maintenance'} onChange={e => set('maintenance.mode', e.target.value)}>
                  {MAINTENANCE_MODES.map(mode => <option key={mode} value={mode}>{MAINTENANCE_MODE_INFO[mode].label}</option>)}
                </select>
              </label>
              <Field label="Headline" placeholder={MAINTENANCE_MODE_INFO[maintenanceMode(values['maintenance.mode'])].headline} value={values['maintenance.headline']} onChange={v => set('maintenance.headline', v)} />
              <Field label="Message" placeholder={MAINTENANCE_MODE_INFO[maintenanceMode(values['maintenance.mode'])].message} value={values['maintenance.message']} onChange={v => set('maintenance.message', v)} />
              <Field label="Note (optional, e.g. Back by 6 pm, or Opening 1 December)" value={values['maintenance.backBy']} onChange={v => set('maintenance.backBy', v)} />
              <p className={styles.note}>Leave the headline and message empty to use the wording for the page type you picked. The page also shows your WhatsApp and contact email (Settings &gt; General). <a className={ui.textLink} href="/maintenance?preview=1" target="_blank" rel="noreferrer">Preview the page</a> (save first to see your changes).</p>
            </Card>
          )}

          {tab === 'Custom data' && (
            <Card title="Custom data" desc="Create structured fields for products and other commerce entities.">
              <p className={ui.muted}>Custom definitions remain available from the dedicated Metafields manager and product editor.</p>
              <a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/metafields">Open metafields</a>
            </Card>
          )}
        </div>
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
        <input className={ui.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 70 123 456" inputMode="tel" aria-label="Phone number to block" />
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={!phone.trim()} onClick={() => update({ phone, note: 'Added in Settings' }, 'Number blocked.')}>Block number</button>
      </div>
      {msg && <p className={ui.muted} role="status">{msg}</p>}
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
          <input className={ui.input} value={url} readOnly onFocus={e => e.currentTarget.select()} aria-label="Feed address" />
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

// `type` and `inputMode` bring up the right keyboard on a phone (email, phone, numbers).
function Field({ label, value, onChange, placeholder, type, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: 'email' | 'tel'; inputMode?: 'numeric' | 'decimal' }) {
  return (
    <label className={ui.fieldLabel}>
      {label}
      <input className={ui.input} type={type} inputMode={inputMode} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
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
      <div className={styles.toggleControl}>
        <span className={value ? `${styles.toggleState} ${styles.toggleStateOn}` : styles.toggleState}>{value ? 'On' : 'Off'}</span>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          className={value ? `${styles.toggleSwitch} ${styles.toggleSwitchOn}` : styles.toggleSwitch}
          onClick={onChange}
        >
          <i />
        </button>
      </div>
    </div>
  )
}

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}
