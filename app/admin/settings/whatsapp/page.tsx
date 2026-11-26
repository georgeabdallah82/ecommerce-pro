import { ArrowLeft, ExternalLink } from 'lucide-react'
import AdminLink from '@/components/admin-link'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { isReadableSecret } from '@/lib/secret-settings'
import { PLAIN_ERRORS, WHATSAPP_KEYS, templateLanguage, templateName } from '@/lib/whatsapp-cloud'
import { LOGIN_TEMPLATE_LABEL, REFILL_TEMPLATE_LABEL, SUGGESTED_LOGIN_TEMPLATE_NAME, SUGGESTED_REFILL_TEMPLATE_NAME, SUGGESTED_TEMPLATE_NAMES, WHATSAPP_LABELS, WHATSAPP_LANGUAGES, WHATSAPP_UPDATES, isArabicTemplate, refillTemplateBody, templateBody } from '@/lib/whatsapp-templates'
import { whatsappOffers, whatsappSetupSteps, type StepStatus, type WhatsAppSetupFacts } from '@/lib/whatsapp-setup'
import ui from '@/components/admin-ui.module.css'
import s from '@/components/admin-whatsapp-guide.module.css'

export const metadata = { title: 'WhatsApp setup guide' }

// A step-by-step guide to connecting the store's WhatsApp number (Meta's WhatsApp Cloud API), for order updates,
// "Running low?" reminders and sign-in codes. Each step ticks itself from the store's settings where the store can
// tell (lib/whatsapp-setup.ts). Owner only (settings.manage), like the settings it explains.
const SETTINGS = '/admin/settings?tab=Email'
const META_APPS = 'https://developers.facebook.com/apps'
const WHATSAPP_MANAGER = 'https://business.facebook.com/wa/manage/home/'
const BUSINESS_SETTINGS = 'https://business.facebook.com/settings'
const PRICING = 'https://developers.facebook.com/docs/whatsapp/pricing'
// The refusals worth explaining here, most common first.
const COMMON_ERRORS = [131030, 132001, 132000, 190, 0, 10, 133010, 131042, 131026, 132015, 132016]

const PILL: Record<StepStatus, { label: string; tone: string }> = {
  done: { label: 'Done', tone: ui.statusPillSuccess },
  todo: { label: 'To do', tone: ui.statusPillWarning },
  problem: { label: 'Needs attention', tone: ui.statusPillDanger },
}
const Pill = ({ status }: { status: StepStatus }) => <span className={`${ui.statusPill} ${PILL[status].tone}`}>{PILL[status].label}</span>
const Out = ({ href, children }: { href: string; children: React.ReactNode }) => <a className={ui.textLink} href={href} target="_blank" rel="noopener noreferrer">{children} <ExternalLink size={13} aria-hidden="true" /></a>

export default async function WhatsAppSetupGuide() {
  await requirePermission('settings.manage')
  const keys = [WHATSAPP_KEYS.enabled, WHATSAPP_KEYS.phoneNumberId, WHATSAPP_KEYS.token, WHATSAPP_KEYS.language, WHATSAPP_KEYS.arabicVersion, WHATSAPP_KEYS.refillTemplate, WHATSAPP_KEYS.loginTemplate, ...Object.values(WHATSAPP_KEYS.templates)]
  const [rows, lastTest] = await Promise.all([
    db.setting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } }),
    db.auditLog.findFirst({ where: { action: 'whatsapp.test_sent' }, orderBy: { createdAt: 'desc' }, select: { metadataJson: true } }).catch(() => null),
  ])
  const map = new Map(rows.map(r => [r.key, r.value]))
  const token = (map.get(WHATSAPP_KEYS.token) || '').trim()
  let test: WhatsAppSetupFacts['lastTest'] = null
  try { if (lastTest) { const m = JSON.parse(lastTest.metadataJson || '{}'); test = { ok: m.ok === true, error: typeof m.error === 'string' ? m.error : undefined } } } catch { test = null }
  const facts: WhatsAppSetupFacts = {
    enabled: map.get(WHATSAPP_KEYS.enabled) === 'true',
    phoneNumberId: /\d/.test(map.get(WHATSAPP_KEYS.phoneNumberId) || ''),
    tokenSaved: !!token,
    tokenReadable: !!token && (await isReadableSecret(token)),
    orderTemplates: WHATSAPP_UPDATES.filter(kind => !!templateName(map.get(WHATSAPP_KEYS.templates[kind]))).length,
    refillTemplate: !!templateName(map.get(WHATSAPP_KEYS.refillTemplate)),
    loginTemplate: !!templateName(map.get(WHATSAPP_KEYS.loginTemplate)),
    lastTest: test,
  }
  const steps = whatsappSetupSteps(facts)
  const step = (id: string) => steps.find(x => x.id === id)!
  const done = steps.filter(x => x.status === 'done').length
  const offers = whatsappOffers(facts)
  const language = templateLanguage(map.get(WHATSAPP_KEYS.language))
  const languageLabel = WHATSAPP_LANGUAGES.find(l => l.code === language)?.label || 'English'
  const withArabic = !isArabicTemplate(language)
  const nameOf = (key: string, suggested: string) => templateName(map.get(key)) || suggested

  return <div className={s.page}>
    <AdminLink className={`${ui.textLink} ${s.back}`} href={SETTINGS}><ArrowLeft size={15} aria-hidden="true" /> Settings › Email &amp; messaging</AdminLink>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OWNER</span>
        <h1 className={ui.title}>WhatsApp setup guide</h1>
        <p className={ui.muted}>Connect your store&apos;s WhatsApp number once. The store then sends order updates, &ldquo;Running low?&rdquo; reminders and sign-in codes by itself. Plan about an hour in Meta, then five minutes here. Each step ticks itself when the store can tell it is done.</p>
      </div>
    </div>

    <section className={`${ui.card} ${s.progress}`} aria-labelledby="progress-title">
      <div className={s.progressHead}><h2 id="progress-title">{done} of {steps.length} steps done</h2><AdminLink className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={SETTINGS}>Open WhatsApp settings</AdminLink></div>
      <ol className={s.stepsNav}>
        {steps.map((x, i) => <li key={x.id}><a href={`#step-${x.id}`}><span>{i + 1}. {x.title}</span><Pill status={x.status} /></a></li>)}
      </ol>
      <ul className={s.offers} aria-label="What customers get now">
        <li><span>Order updates on WhatsApp (checkout offers them)</span><strong>{offers.orderUpdates ? 'On' : 'Off'}</strong></li>
        <li><span>&ldquo;Running low?&rdquo; reminders on WhatsApp (otherwise by email)</span><strong>{offers.reminders ? 'On' : 'Off'}</strong></li>
        <li><span>&ldquo;Sign in with WhatsApp&rdquo; on the sign-in page</span><strong>{offers.signIn ? 'On' : 'Off'}</strong></li>
      </ul>
      <p className={s.note}>The green WhatsApp chat button on your store pages is separate: it only opens a chat with your number and needs none of this.</p>
    </section>

    <section id="step-meta" className={`${ui.card} ${s.step}`}>
      <div className={s.stepHead}><h2 className={s.stepTitle}><span className={s.number}>1</span>{step('meta').title}</h2><Pill status={step('meta').status} /></div>
      <p className={s.note}>{step('meta').summary} Meta changes these screens from time to time: the names in bold are what to look for.</p>
      <ol className={s.list}>
        <li>Open <Out href={META_APPS}>Meta for Developers</Out> with the Facebook account that manages your business, and <b>Create app</b>: choose the use case for connecting with customers on <b>WhatsApp</b>, and pick your business (the one with your Facebook page and ad account).</li>
        <li>In the app, open <b>WhatsApp › API Setup</b>. Meta first gives you a free <b>test number</b>: it can send to up to 5 numbers you add as recipients, which is enough to try everything before using your real number.</li>
        <li>Add your store&apos;s number with <b>Add phone number</b>: the name customers will see (your store&apos;s name), then the code Meta sends by SMS or call. A number already used in the WhatsApp or WhatsApp Business app on a phone has to be removed from that app first, or use a second number for the store&apos;s messages.</li>
        <li>In <Out href={WHATSAPP_MANAGER}>WhatsApp Manager</Out>, add a <b>payment method</b>. Meta charges a small fee for each message it delivers; the prices by country are on <Out href={PRICING}>Meta&apos;s pricing page</Out>.</li>
      </ol>
    </section>

    <section id="step-number" className={`${ui.card} ${s.step}`}>
      <div className={s.stepHead}><h2 className={s.stepTitle}><span className={s.number}>2</span>{step('number').title}</h2><Pill status={step('number').status} /></div>
      <ol className={s.list}>
        <li>In the app, <b>WhatsApp › API Setup</b>, choose your number in the <b>From</b> list. Its <b>Phone number ID</b> is shown under it: a long number like 106540352242922 (also in WhatsApp Manager › <b>Phone numbers</b>). It is not your phone number.</li>
        <li>Paste it in <AdminLink className={ui.textLink} href={SETTINGS}>Settings › Email &amp; messaging</AdminLink> › Automatic WhatsApp messages › <b>Phone number ID</b>, and save.</li>
      </ol>
      <p className={s.note}>Now: {step('number').summary}</p>
    </section>

    <section id="step-key" className={`${ui.card} ${s.step}`}>
      <div className={s.stepHead}><h2 className={s.stepTitle}><span className={s.number}>3</span>{step('key').title}</h2><Pill status={step('key').status} /></div>
      <p className={s.note}>The key shown on the API Setup page stops working after a day. The store needs a permanent one.</p>
      <ol className={s.list}>
        <li>In <Out href={BUSINESS_SETTINGS}>Meta Business settings</Out>, open <b>Users › System users</b> and <b>Add</b> one with the role <b>Admin</b> (for example &ldquo;Store messages&rdquo;).</li>
        <li><b>Assign assets</b> to it: your app and your WhatsApp account, each with full control.</li>
        <li><b>Generate new token</b>: choose your app, set it to <b>never expire</b>, and tick <b>whatsapp_business_messaging</b> and <b>whatsapp_business_management</b>.</li>
        <li>Copy the key and paste it in <AdminLink className={ui.textLink} href={SETTINGS}>Settings</AdminLink> › <b>Access key</b>, then save. The store keeps it sealed and never shows it again; treat it like a password.</li>
      </ol>
      <p className={s.note}>Now: {step('key').summary}</p>
    </section>

    <section id="step-templates" className={`${ui.card} ${s.step}`}>
      <div className={s.stepHead}><h2 className={s.stepTitle}><span className={s.number}>4</span>{step('templates').title}</h2><Pill status={step('templates').status} /></div>
      <p className={s.note}>WhatsApp only lets a business start a chat with a template Meta has approved. Create each one in <Out href={WHATSAPP_MANAGER}>WhatsApp Manager</Out> › <b>Message templates › Create template</b>, in {languageLabel} (the language set in Settings); approval usually takes minutes. Then type each name in Settings and save. A message without a name is simply not sent.</p>
      <div className={s.templates}>
        {WHATSAPP_UPDATES.map(kind => <div className={s.template} key={kind}>
          <div className={s.templateHead}><strong>{nameOf(WHATSAPP_KEYS.templates[kind], SUGGESTED_TEMPLATE_NAMES[kind])}</strong><span className={ui.muted}>{WHATSAPP_LABELS[kind]} · category Utility</span></div>
          <pre dir="auto">{templateBody(kind, language)}</pre>
        </div>)}
        <div className={s.template}>
          <div className={s.templateHead}><strong>{nameOf(WHATSAPP_KEYS.refillTemplate, SUGGESTED_REFILL_TEMPLATE_NAME)}</strong><span className={ui.muted}>{REFILL_TEMPLATE_LABEL} · category Marketing · optional</span></div>
          <pre dir="auto">{refillTemplateBody(language)}</pre>
        </div>
        <div className={s.template}>
          <div className={s.templateHead}><strong>{nameOf(WHATSAPP_KEYS.loginTemplate, SUGGESTED_LOGIN_TEMPLATE_NAME)}</strong><span className={ui.muted}>{LOGIN_TEMPLATE_LABEL} · category Authentication · optional</span></div>
          <p className={s.note}>WhatsApp writes this one itself (&ldquo;123456 is your verification code.&rdquo;): choose <b>Copy code</b>, tick the security note, and set the code to expire in 10 minutes. It turns on &ldquo;Sign in with WhatsApp&rdquo;.</p>
        </div>
      </div>
      {withArabic && <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>For customers who shop in Arabic</summary>
        <p className={s.note}>Add the language <b>Arabic</b> to each template, with the same name and the text below, and turn on &ldquo;My templates also have an Arabic version&rdquo; in Settings. A template without its Arabic version is sent in {languageLabel}.</p>
        <div className={s.templates}>
          {WHATSAPP_UPDATES.map(kind => <div className={s.template} key={kind}><div className={s.templateHead}><strong>{nameOf(WHATSAPP_KEYS.templates[kind], SUGGESTED_TEMPLATE_NAMES[kind])}</strong><span className={ui.muted}>Arabic</span></div><pre dir="rtl" lang="ar">{templateBody(kind, 'ar')}</pre></div>)}
          <div className={s.template}><div className={s.templateHead}><strong>{nameOf(WHATSAPP_KEYS.refillTemplate, SUGGESTED_REFILL_TEMPLATE_NAME)}</strong><span className={ui.muted}>Arabic</span></div><pre dir="rtl" lang="ar">{refillTemplateBody('ar')}</pre></div>
        </div>
      </details>}
      <p className={s.note}>Now: {step('templates').summary}</p>
    </section>

    <section id="step-test" className={`${ui.card} ${s.step}`}>
      <div className={s.stepHead}><h2 className={s.stepTitle}><span className={s.number}>5</span>{step('test').title}</h2><Pill status={step('test').status} /></div>
      <ol className={s.list}>
        <li>In <AdminLink className={ui.textLink} href={SETTINGS}>Settings</AdminLink>, turn on <b>Send automatic WhatsApp messages</b> and save.</li>
        <li>Use <b>Send a test</b> with your own WhatsApp number, once for each template. If WhatsApp refuses one, the store says why in plain words (see below).</li>
        <li>Then customers can tick &ldquo;Send my order updates on WhatsApp&rdquo; at checkout, get &ldquo;Running low?&rdquo; reminders on WhatsApp, and sign in with a code, each once its template is set.</li>
      </ol>
      <p className={s.note}>Now: {step('test').summary}</p>
    </section>

    <section className={`${ui.card} ${s.step}`} aria-labelledby="errors-title">
      <h2 id="errors-title" className={s.stepTitle}>If a test fails</h2>
      <ul className={s.errors}>
        {COMMON_ERRORS.filter(code => PLAIN_ERRORS[code]).map(code => <li key={code}><span className={s.code}>{code === 0 ? 'Key' : code}</span><span>{PLAIN_ERRORS[code].charAt(0).toUpperCase() + PLAIN_ERRORS[code].slice(1)}.</span></li>)}
      </ul>
      <p className={s.note}>Every message the store sends is also noted on its order, with WhatsApp&apos;s answer when it was refused.</p>
    </section>
  </div>
}
