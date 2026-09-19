import { getThemeState } from '@/lib/theme'
import { config } from '@/lib/config'
import { getContactInfo } from '@/lib/store-contact'
import { Footer } from '@/components/footer'
import { LegalPage, Placeholder, ConfiguredField } from '@/components/legal-page'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TermsOfService() {
  const [{ theme }, contact] = await Promise.all([getThemeState(), getContactInfo()])
  const brand = theme.brandName || config.brand
  const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return <>
    <LegalPage title="Terms of Service" updated={updated}>
      <p>These terms apply whenever you browse or place an order on this website ("the Store"), operated by {brand}. By placing an order, you agree to them.</p>

      <h2>Orders and pricing</h2>
      <p>Prices are shown in {theme.currency || config.currency} and include or exclude tax as displayed at checkout. We reserve the right to correct pricing or listing errors, and to cancel and refund an order placed against an incorrect price before it ships.</p>
      <p>Placing an order is an offer to buy; the order is only confirmed once you receive an order confirmation. Available payment methods (card, cash on delivery, or bank transfer) are shown at checkout and may vary by order.</p>

      <h2>Stock and availability</h2>
      <p>We make a reasonable effort to keep stock levels accurate, but availability isn't guaranteed until your order is confirmed. If an item in your order turns out to be unavailable, we'll contact you to offer a substitute, a partial refund, or a full refund.</p>

      <h2>Coupons and promotions</h2>
      <p>Discount codes and promotions are subject to their own stated terms (minimum spend, eligible products, expiry date) and may be withdrawn or changed at any time before an order using them is placed.</p>

      <h2>Shipping and delivery</h2>
      <p>Delivery times shown at checkout are estimates, not guarantees. Risk in the goods passes to you once they're delivered to the address you provided.</p>

      <h2>Returns and refunds</h2>
      <p>Returns and refunds are handled under our <a href="/refund-policy">Refund Policy</a>.</p>

      <h2>Accounts</h2>
      <p>You're responsible for keeping your account password confidential and for all activity under your account. Tell us right away if you suspect unauthorized access.</p>

      <h2>Acceptable use</h2>
      <p>You agree not to misuse the Store — including attempting to interfere with its normal operation, placing fraudulent orders, or using it to violate any applicable law.</p>

      <h2>Limitation of liability</h2>
      <p>To the extent permitted by law, {brand} isn't liable for indirect or consequential losses arising from use of the Store. Nothing in these terms limits any liability that can't legally be limited.</p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms from time to time; the current version always applies. Material changes will be reflected by an updated "Last updated" date above.</p>

      <h2>Contact us</h2>
      <p>
        {brand}<br/>
        <ConfiguredField value={config.businessAddress} placeholder="[registered business address]"/><br/>
        <ConfiguredField value={contact.email} placeholder="[support email address]"/>
        {contact.phone && <> · WhatsApp: {contact.phone}</>}
      </p>
      <p>These terms are governed by the laws of <Placeholder>[{config.country}, or your actual jurisdiction]</Placeholder>.</p>
    </LegalPage>
    <Footer theme={theme}/>
  </>
}
