import { getThemeState } from '@/lib/theme'
import { config } from '@/lib/config'
import { getContactInfo } from '@/lib/store-contact'
import { Footer } from '@/components/footer'
import { LegalPage, Placeholder, ConfiguredField } from '@/components/legal-page'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PrivacyPolicy() {
  const [{ theme }, contact] = await Promise.all([getThemeState(), getContactInfo()])
  const brand = theme.brandName || config.brand
  const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return <>
    <LegalPage title="Privacy Policy" updated={updated}>
      <p>This Privacy Policy explains what information {brand} collects when you visit or place an order on this website, and how that information is used.</p>

      <h2>Information you give us</h2>
      <p>When you place an order, create an account, or contact us, we collect the information you provide: your name, email address, phone number, and shipping/billing address. If wallet or store-credit features are enabled, we also keep a record of that balance against your account.</p>

      <h2>Payment information</h2>
      <p>If you pay by card, your card details are entered directly with our payment processor and are never stored on our servers. We keep a record of the transaction (amount, status, and a reference ID from the processor) to manage your order, provide refunds, and prevent fraud. If you choose cash on delivery or bank transfer, no card details are collected at all.</p>

      <h2>Information collected automatically</h2>
      <p>Like most websites, we automatically log some technical information on every visit: your IP address, an approximate location derived from it (country/city/region), device type, browser, operating system, and the page you came from. This is used for order security, fraud prevention, and to understand overall site traffic — it is not linked to your identity unless you also place an order.</p>
      <p>Separately, some pages may ask your browser for a more precise location (for example, to power a live visitor map). This is always an explicit opt-in prompt from your browser — we only receive it if you choose "Allow."</p>
      <p>We use cookies and local browser storage to remember your cart, wishlist, and login session. These are functional and don't track you across other websites.</p>

      <h2>How we use your information</h2>
      <ul>
        <li>To process and deliver your orders, including contacting you about order status, shipping, and delivery.</li>
        <li>To handle returns, refunds, and customer support requests.</li>
        <li>To send order confirmations and, if you opt in, marketing updates.</li>
        <li>To detect and prevent fraud or abuse of the site.</li>
        <li>To improve the store based on aggregate, non-identifying traffic patterns.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We share order information with the services needed to fulfill it: our payment processor (to take payment), our email provider (to send order confirmations), and shipping/delivery partners (to get your order to you). We do not sell your personal information to third parties.</p>

      <h2>Data retention</h2>
      <p>We keep order records for as long as needed for accounting, warranty, and legal purposes. You can ask us to delete your account and associated personal data at any time, subject to records we're required to keep by law.</p>

      <h2>Your rights</h2>
      <p>You can request a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it, by contacting us using the details below.</p>

      <h2>Contact us</h2>
      <p>
        {brand}<br/>
        <ConfiguredField value={config.businessAddress} placeholder="[registered business address]"/><br/>
        <ConfiguredField value={contact.email} placeholder="[support email address]"/>
        {contact.phone && <> · WhatsApp: {contact.phone}</>}
      </p>
      <p>This policy is governed by the laws of <Placeholder>[{config.country}, or your actual jurisdiction]</Placeholder>.</p>
    </LegalPage>
    <Footer theme={theme}/>
  </>
}
