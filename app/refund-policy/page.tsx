import { getThemeState } from '@/lib/theme'
import { config } from '@/lib/config'
import { getContactInfo, getPolicyInfo } from '@/lib/store-contact'
import { Footer } from '@/components/footer'
import { LegalPage, LegalContact } from '@/components/legal-page'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function RefundPolicy() {
  const [{ theme }, contact, policy] = await Promise.all([getThemeState(), getContactInfo(), getPolicyInfo()])
  const brand = theme.brandName || config.brand

  return <>
    <LegalPage title="Refund Policy" updated={policy.updated}>
      <p>We want you to be happy with your order from {brand}. This policy covers returns, exchanges, and refunds.</p>

      <h2>Return window</h2>
      <p>You can request a return within {policy.returnDays} days of receiving your order. To be eligible, an item must be unused, in its original packaging, and in the same condition you received it.</p>

      <h2>How to start a return</h2>
      <p>
        Contact us with your order number and the reason for the return{contact.phone && <> — the fastest way is WhatsApp: {contact.phone}</>}, or use <a href="/orders/lookup">order tracking</a> to find your order and request support. We'll confirm whether the item is eligible and provide return instructions.
      </p>

      <h2>Refunds</h2>
      <p>Once we receive and inspect the returned item, we'll notify you whether the refund is approved. Approved refunds are issued to the original payment method (for card and bank transfer orders) or as store credit (for cash-on-delivery orders, where applicable), usually within {policy.refundTime} depending on your bank.</p>
      <p>If only part of an order is returned, only the returned item(s) are refunded; original shipping charges are refunded only if the return is due to our error (wrong or defective item).</p>

      <h2>Damaged or incorrect items</h2>
      <p>If an item arrives damaged, defective, or different from what you ordered, contact us within {policy.damageReportHours} hours of delivery with photos of the item — we'll arrange a replacement or full refund at no cost to you.</p>

      <h2>Non-returnable items</h2>
      <p>Some items can't be returned for hygiene, safety, or made-to-order reasons. Any such exclusions will be clearly marked on the product page before you order.</p>

      <h2>Cancellations</h2>
      <p>You can cancel an order before it ships by contacting us as soon as possible. Once an order has shipped, it follows the return process above instead.</p>

      <h2>Contact us</h2>
      <LegalContact brand={brand} contact={contact}/>
    </LegalPage>
    <Footer theme={theme}/>
  </>
}
